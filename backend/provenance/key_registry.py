"""Tracks every public key a signing role (provenance / audit) has ever
used, so that rotating to a new private key never invalidates signatures
issued under a previous one. Without this, `ProvenanceSigner.verify_signature`
only ever checks against whichever key is *currently* active, and rotation
would silently turn every historical record's signature invalid -- an
outcome indistinguishable from tampering, defeating the point of a
tamper-evident chain the moment an operator does the responsible thing
and rotates keys.

The registry itself is a plain append-only JSON file, not a cryptographic
structure -- it doesn't need to be, because every entry records a public
key, not a secret, and the entries it lists are only ever *added to*,
never edited or removed by the rotation tooling. If stronger integrity
guarantees over the registry itself are needed, checkpoint it into the
tamper-evident audit ledger (the CLI below does exactly that).
"""
import json
import os
import time
from typing import Any, Dict, List, Optional


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class KeyRegistry:
    def __init__(self, registry_path: str):
        self.registry_path = registry_path
        self._entries: List[Dict[str, Any]] = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self.registry_path):
            return []
        with open(self.registry_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save(self) -> None:
        dir_name = os.path.dirname(self.registry_path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(self._entries, f, indent=2)

    def register(self, role: str, public_key_hex: str, retired_previous: bool = True) -> Dict[str, Any]:
        """Adds a new active key for `role` (e.g. "provenance", "audit"),
        marking any previously-active key for that role as retired (still
        listed, still valid for verifying old signatures -- just no longer
        the one new signatures are issued under)."""
        if retired_previous:
            for entry in self._entries:
                if entry["role"] == role and entry["retired_at"] is None:
                    entry["retired_at"] = _now()

        entry = {
            "role": role,
            "public_key_hex": public_key_hex,
            "created_at": _now(),
            "retired_at": None,
        }
        self._entries.append(entry)
        self._save()
        return entry

    def all_public_keys_for_role(self, role: str) -> List[str]:
        """Every public key ever registered for this role, active or
        retired -- the full set a verifier must check a signature against."""
        return [e["public_key_hex"] for e in self._entries if e["role"] == role]

    def active_key_for_role(self, role: str) -> Optional[str]:
        for entry in reversed(self._entries):
            if entry["role"] == role and entry["retired_at"] is None:
                return entry["public_key_hex"]
        return None

    def history_for_role(self, role: str) -> List[Dict[str, Any]]:
        return [e for e in self._entries if e["role"] == role]
