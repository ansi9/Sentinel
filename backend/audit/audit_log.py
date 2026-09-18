import hashlib
import json
import os
import time
from typing import List, Optional, Tuple
from ..provenance.signing import ProvenanceSigner
from ..schemas import AuditLogEntry

DEFAULT_LEDGER_PATH = os.environ.get("IntelX_AUDIT_LEDGER_PATH", "audit_log/ledger.jsonl")
DEFAULT_AUDIT_KEY_PATH = os.environ.get("IntelX_AUDIT_SIGNING_KEY_PATH", "keys/audit_signing_key.pem")


class TamperEvidentAuditLedger:
    """A hash-chained, individually-signed audit ledger. Optionally
    persisted to a JSON-lines file so the tamper-evident trail survives
    process restarts -- an in-memory-only ledger that resets every time the
    service restarts is not a real audit trail for a long-lived deployment.

    Each entry's hash is additionally signed with Ed25519 (a dedicated
    signing key, separate from the inference-provenance key) so that
    integrity verification does not rely solely on possessing the chain --
    an attacker who could rewrite the entire file from the genesis block
    forward still cannot forge a valid signature over a tampered entry
    without the private key."""

    def __init__(
        self,
        genesis_digest: str = "INTELX_DEFENCE_AUDIT_GENESIS_BLOCK_2026",
        persist_path: Optional[str] = None,
        signer: Optional[ProvenanceSigner] = None,
    ):
        self.genesis_digest = genesis_digest
        self.entries: List[AuditLogEntry] = []
        self._last_hash = hashlib.sha256(genesis_digest.encode("utf-8")).hexdigest()
        self._persist_path = persist_path
        self.signer = signer or ProvenanceSigner(key_path=DEFAULT_AUDIT_KEY_PATH, role="audit")
        if persist_path and os.path.exists(persist_path):
            self._load_from_disk(persist_path)

    def _load_from_disk(self, path: str) -> None:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = AuditLogEntry.model_validate_json(line)
                self.entries.append(entry)
                self._last_hash = entry.entry_hash

    def _append_to_disk(self, entry: AuditLogEntry) -> None:
        if not self._persist_path:
            return
        dir_name = os.path.dirname(self._persist_path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(self._persist_path, "a", encoding="utf-8") as f:
            f.write(entry.model_dump_json() + "\n")

    def record_event(
        self,
        event: str,
        asset_id: str,
        operation: str,
        input_digest: str,
        result: str,
        evidence_reference: str = "",
    ) -> AuditLogEntry:
        seq_id = len(self.entries) + 1
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        prev_hash = self._last_hash

        entry_payload = f"{seq_id}:{ts}:{event}:{asset_id}:{operation}:{input_digest}:{result}:{evidence_reference}:{prev_hash}"
        entry_hash = hashlib.sha256(entry_payload.encode("utf-8")).hexdigest()
        signature = self.signer.sign_provenance_hash(entry_hash)

        entry = AuditLogEntry(
            sequence_id=seq_id,
            timestamp=ts,
            event=event,
            asset_id=asset_id,
            operation=operation,
            input_digest=input_digest,
            result=result,
            evidence_reference=evidence_reference,
            previous_entry_hash=prev_hash,
            entry_hash=entry_hash,
            signature=signature,
        )

        self.entries.append(entry)
        self._last_hash = entry_hash
        self._append_to_disk(entry)
        return entry

    def verify_ledger_integrity(self) -> Tuple[bool, List[str]]:
        errors: List[str] = []
        expected_prev = hashlib.sha256(self.genesis_digest.encode("utf-8")).hexdigest()

        for idx, entry in enumerate(self.entries):
            if entry.previous_entry_hash != expected_prev:
                errors.append(
                    f"Chain broken at entry #{entry.sequence_id}: previous_entry_hash mismatch (expected {expected_prev[:12]}..., got {entry.previous_entry_hash[:12]}...)"
                )

            recalc_payload = f"{entry.sequence_id}:{entry.timestamp}:{entry.event}:{entry.asset_id}:{entry.operation}:{entry.input_digest}:{entry.result}:{entry.evidence_reference}:{entry.previous_entry_hash}"
            recalc_hash = hashlib.sha256(recalc_payload.encode("utf-8")).hexdigest()

            if recalc_hash != entry.entry_hash:
                errors.append(
                    f"Tampered record at sequence #{entry.sequence_id}: calculated hash {recalc_hash[:12]}... != stored hash {entry.entry_hash[:12]}..."
                )

            if not entry.signature:
                errors.append(
                    f"Unsigned entry at sequence #{entry.sequence_id}: no Ed25519 signature present, "
                    "integrity of this entry cannot be cryptographically confirmed independent of the hash chain."
                )
            elif not self.signer.verify_signature(
                entry.entry_hash, entry.signature, record_timestamp=entry.timestamp
            ):
                errors.append(
                    f"Invalid signature at sequence #{entry.sequence_id}: Ed25519 signature does not "
                    "verify against the stored entry_hash (SIGNATURE FORGERY OR CORRUPTION DETECTED)."
                )

            expected_prev = entry.entry_hash

        return len(errors) == 0, errors

    @property
    def current_chain_digest(self) -> str:
        return self._last_hash

    def get_entries(self) -> List[AuditLogEntry]:
        return self.entries

    def entries_since(self, start_index: int) -> List[AuditLogEntry]:
        return self.entries[start_index:]


# Process-wide singleton. Every route (scenario replay and live analysis
# alike) records into this ONE ledger so the audit trail reflects everything
# the service actually did, not just whichever code path happened to
# instantiate its own throwaway ledger.
shared_ledger = TamperEvidentAuditLedger(persist_path=DEFAULT_LEDGER_PATH)
