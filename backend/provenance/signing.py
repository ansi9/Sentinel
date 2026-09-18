import base64
import os
import time
from typing import Optional
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from .key_registry import KeyRegistry

DEFAULT_KEY_PATH = os.environ.get("INTELX_SIGNING_KEY_PATH", "keys/provenance_signing_key.pem")
DEFAULT_KEY_REGISTRY_PATH = os.environ.get("INTELX_KEY_REGISTRY_PATH", "keys/key_registry.json")


class ProvenanceSigner:
    """Signs/verifies with Ed25519. The private key is persisted to disk
    (not regenerated per process): a freshly-generated, never-saved key
    would make every previously-issued signature unverifiable the moment
    the service restarts, which defeats the point of a long-lived
    tamper-evident chain.

    Every public key this signer (or a prior rotation of it) has ever used
    is tracked in a `KeyRegistry` under `role` (e.g. "provenance", "audit"
    -- distinct roles get distinct registry entries even though they may
    share a registry file). `verify_signature` checks the current key
    first, then falls back to every historical key for the role, so
    calling `rotate()` never invalidates signatures issued before the
    rotation.
    """

    def __init__(
        self,
        private_key: Optional[ed25519.Ed25519PrivateKey] = None,
        key_path: str = DEFAULT_KEY_PATH,
        role: str = "provenance",
        registry_path: str = DEFAULT_KEY_REGISTRY_PATH,
    ):
        self._key_path = key_path
        self._role = role
        self._registry = KeyRegistry(registry_path)
        self._private_key = private_key or self._load_or_create_key(key_path)
        self._public_key = self._private_key.public_key()

        if self.public_key_hex not in self._registry.all_public_keys_for_role(role):
            self._registry.register(role, self.public_key_hex)

    @staticmethod
    def _load_or_create_key(key_path: str) -> ed25519.Ed25519PrivateKey:
        if os.path.exists(key_path):
            with open(key_path, "rb") as f:
                return serialization.load_pem_private_key(f.read(), password=None)

        key = ed25519.Ed25519PrivateKey.generate()
        key_dir = os.path.dirname(key_path)
        if key_dir:
            os.makedirs(key_dir, exist_ok=True)
        pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            # Another process won the race to create it first; use theirs.
            with open(key_path, "rb") as f:
                return serialization.load_pem_private_key(f.read(), password=None)
        with os.fdopen(fd, "wb") as f:
            f.write(pem)
        return key

    @property
    def public_key_bytes(self) -> bytes:
        return self._public_key.public_bytes_raw()

    @property
    def public_key_hex(self) -> str:
        return self._public_key.public_bytes_raw().hex()

    def sign_provenance_hash(self, provenance_hash: str) -> str:
        sig_bytes = self._private_key.sign(provenance_hash.encode("utf-8"))
        return base64.b64encode(sig_bytes).decode("utf-8")

    def verify_signature(
        self,
        provenance_hash: str,
        signature_b64: str,
        record_timestamp: Optional[str] = None,
    ) -> bool:
        """`record_timestamp` (the claimed creation time of the thing being
        verified, in the same "%Y-%m-%dT%H:%M:%SZ" format used throughout
        this codebase -- fixed-width, so lexicographic comparison equals
        chronological order) lets this method enforce that a RETIRED key
        can only validate records that were plausibly signed while it was
        still active. Without this, rotating a key because its private key
        was compromised would not actually revoke it: the attacker could
        still sign brand-new records with the leaked key and have them
        verify via the "fall back to every historical key" path below,
        which defeats the entire purpose of rotation. Callers that don't
        have a trustworthy timestamp to hand (record_timestamp=None) get
        the old, unrestricted behavior -- but every real caller in this
        codebase (InferenceRecord.timestamp, AuditLogEntry.timestamp) does
        have one and must pass it."""
        try:
            sig_bytes = base64.b64decode(signature_b64.encode("utf-8"))
        except Exception:
            return False

        # Current key first (the common case, and avoids depending on the
        # registry file existing at all for a signer that's never rotated).
        # The currently-active key has no retirement window to check.
        try:
            self._public_key.verify(sig_bytes, provenance_hash.encode("utf-8"))
            return True
        except Exception:
            pass

        # Fall back to every historical key for this role -- required so a
        # record signed before a rotation still verifies afterward. Each
        # retired key is only trusted for the window it was actually
        # active: [created_at, retired_at). A record timestamped after a
        # key's retirement cannot have been legitimately signed with it,
        # even if the attacker still holds that private key.
        for entry in self._registry.history_for_role(self._role):
            hex_key = entry["public_key_hex"]
            if hex_key == self.public_key_hex:
                continue
            if record_timestamp is not None:
                created_at = entry.get("created_at")
                retired_at = entry.get("retired_at")
                if created_at is not None and record_timestamp < created_at:
                    continue
                if retired_at is not None and record_timestamp > retired_at:
                    continue
            try:
                candidate = ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(hex_key))
                candidate.verify(sig_bytes, provenance_hash.encode("utf-8"))
                return True
            except Exception:
                continue
        return False

    def rotate(self) -> str:
        """Retires the current private key (archived alongside the active
        key path with a timestamp suffix -- never deleted, since a signer
        instance holding the old key in memory may still need to produce
        signatures during the same process lifetime, and the archived file
        is a human-auditable record of exactly when rotation happened),
        generates a fresh Ed25519 keypair, persists it as the new active
        key, and registers the new public key (marking the old one
        retired-but-still-verifiable). Returns the new public key's hex
        fingerprint."""
        if os.path.exists(self._key_path):
            archive_path = f"{self._key_path}.retired-{int(time.time())}"
            os.rename(self._key_path, archive_path)

        new_key = ed25519.Ed25519PrivateKey.generate()
        pem = new_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        key_dir = os.path.dirname(self._key_path)
        if key_dir:
            os.makedirs(key_dir, exist_ok=True)
        fd = os.open(self._key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(pem)

        self._private_key = new_key
        self._public_key = new_key.public_key()
        self._registry.register(self._role, self.public_key_hex)
        return self.public_key_hex
