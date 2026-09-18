#!/usr/bin/env python3
"""Standalone, air-gapped offline verification CLI for IntelX.

Verifies:
  1. The hash-chained, Ed25519-signed tamper-evident audit ledger
     (audit_log/ledger.jsonl by default).
  2. One or more signed inference-provenance records (JSON files, or every
     record currently held in the local SQLite evidence store).

This tool does NOT start the FastAPI service, does NOT open a network
socket, and does NOT depend on any of the `api/` route modules -- it reads
only local files (the ledger, key material, and optionally the local
SQLite DB) and reconstructs the exact same verification logic the running
service uses (`TamperEvidentAuditLedger.verify_ledger_integrity` and
`ProvenanceVerifier.verify_record`), so it can run entirely on an
air-gapped analyst workstation.

Usage:
    python -m backend.tools.verify_offline audit \
        --ledger audit_log/ledger.jsonl

    python -m backend.tools.verify_offline record \
        --record path/to/inference_record.json

    python -m backend.tools.verify_offline record \
        --record-id rec_abc123 --db intelx.db

    python -m backend.tools.verify_offline all
        (verifies the ledger and every inference record in the local DB)

Exit code is 0 when everything verified checks out clean, 1 otherwise --
safe to wire into a CI gate or a pre-approval script.
"""
import argparse
import json
import sys
from typing import Any, Dict, List

from ..audit.audit_log import TamperEvidentAuditLedger, DEFAULT_LEDGER_PATH
from ..provenance.verification import ProvenanceVerifier
from ..schemas import InferenceRecord


def _print_header(title: str) -> None:
    print("=" * 72)
    print(title)
    print("=" * 72)


def verify_audit_ledger(ledger_path: str) -> bool:
    _print_header(f"AUDIT LEDGER VERIFICATION: {ledger_path}")
    ledger = TamperEvidentAuditLedger(persist_path=ledger_path)
    is_valid, errors = ledger.verify_ledger_integrity()

    print(f"Entries loaded:      {len(ledger.entries)}")
    print(f"Chain digest (tip):  {ledger.current_chain_digest}")
    print(f"Signing public key:  {ledger.signer.public_key_hex}")
    print(f"Chain integrity:     {'VALID' if is_valid else 'INVALID / TAMPER DETECTED'}")

    if errors:
        print(f"\n{len(errors)} integrity violation(s):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("\nNo integrity violations detected. All entries are hash-chained,")
        print("individually Ed25519-signed, and verify against the genesis block.")

    return is_valid


def verify_single_record(
    record: InferenceRecord, check_replay: bool = False, verifier: "ProvenanceVerifier" = None
) -> bool:
    """`verifier` defaults to a fresh instance when omitted (a one-off
    single-record check has no replay/reorder history to compare against
    anyway). Callers checking MULTIPLE records from the same stream
    (`verify_all_db_records`) must pass one shared verifier instance
    across all of them -- replay/reorder detection needs seen_nonces and
    last_verified_sequence to accumulate across records, not reset to
    empty on every call."""
    verifier = verifier or ProvenanceVerifier()
    is_valid, errors = verifier.verify_record(record, check_replay=check_replay)
    status = "VALID" if is_valid else "TAMPERING / INTEGRITY FAILURE DETECTED"
    print(f"record_id:        {record.record_id}")
    print(f"sequence_number:  {record.sequence_number}")
    print(f"provenance_hash:  {record.provenance_hash}")
    print(f"status:           {status}")
    if errors:
        for e in errors:
            print(f"  - {e}")
    return is_valid


def verify_record_file(path: str) -> bool:
    _print_header(f"INFERENCE RECORD VERIFICATION: {path}")
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    record = InferenceRecord.model_validate(raw)
    return verify_single_record(record)


def verify_all_db_records(db_path: str) -> bool:
    from ..persistence import db as db_module

    _print_header(f"ALL INFERENCE RECORDS IN LOCAL DB: {db_path}")
    # Pass db_path explicitly rather than relying on the IntelX_DB_PATH
    # env var: db_module.DB_PATH is a module-level constant resolved once
    # at import time, so setting the env var here has no effect once the
    # module has already been imported elsewhere in the process (e.g. by
    # the FastAPI app in the same test session).
    rows = db_module.list_inference_records(limit=100000, db_path=db_path)
    if not rows:
        print("No inference records found in the local evidence store.")
        return True

    records = [InferenceRecord.model_validate(json.loads(row["record_json"])) for row in rows]
    # Verify in sequence order (not DB insertion/query order, which is
    # created_at DESC) so replay/reordering detection below is checking
    # the actual claimed stream order, not an arbitrary one.
    records.sort(key=lambda r: r.sequence_number)

    # One shared verifier for the whole batch: `seen_nonces` and
    # `last_verified_sequence` must accumulate across every record in this
    # stream for replay/reordering to be detectable at all. A fresh
    # verifier per record (the previous behavior) reset that state to
    # empty every time, so a replayed or reordered record among these
    # would have been silently reported VALID.
    verifier = ProvenanceVerifier()
    all_valid = True
    for record in records:
        ok = verify_single_record(record, check_replay=True, verifier=verifier)
        print("-" * 72)
        all_valid = all_valid and ok
    print(f"\n{len(records)} record(s) checked. Overall: {'ALL VALID' if all_valid else 'ONE OR MORE FAILURES'}")
    return all_valid


def main(argv: List[str] = None) -> int:
    parser = argparse.ArgumentParser(description="IntelX offline, air-gapped integrity verification CLI.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_audit = sub.add_parser("audit", help="Verify the tamper-evident, hash-chained audit ledger.")
    p_audit.add_argument("--ledger", default=DEFAULT_LEDGER_PATH, help="Path to ledger.jsonl")

    p_record = sub.add_parser("record", help="Verify one signed inference-provenance record.")
    p_record.add_argument("--record", help="Path to a saved InferenceRecord JSON file.")
    p_record.add_argument("--record-id", help="record_id to look up in the local SQLite DB.")
    p_record.add_argument("--db", default="intelx.db", help="Path to the local SQLite evidence store.")

    p_all = sub.add_parser("all", help="Verify the audit ledger and every inference record in the local DB.")
    p_all.add_argument("--ledger", default=DEFAULT_LEDGER_PATH, help="Path to ledger.jsonl")
    p_all.add_argument("--db", default="intelx.db", help="Path to the local SQLite evidence store.")

    args = parser.parse_args(argv)

    if args.command == "audit":
        ok = verify_audit_ledger(args.ledger)
        return 0 if ok else 1

    if args.command == "record":
        if args.record:
            ok = verify_record_file(args.record)
            return 0 if ok else 1
        if args.record_id:
            from ..persistence import db as db_module

            row = db_module.get_inference_record(args.record_id, db_path=args.db)
            if not row:
                print(f"No stored inference record for record_id={args.record_id}", file=sys.stderr)
                return 2
            record = InferenceRecord.model_validate(json.loads(row["record_json"]))
            ok = verify_single_record(record)
            return 0 if ok else 1
        print("Must supply --record <file> or --record-id <id>", file=sys.stderr)
        return 2

    if args.command == "all":
        audit_ok = verify_audit_ledger(args.ledger)
        print()
        records_ok = verify_all_db_records(args.db)
        overall = audit_ok and records_ok
        print()
        _print_header(f"OVERALL RESULT: {'PASS' if overall else 'FAIL'}")
        return 0 if overall else 1

    return 2


if __name__ == "__main__":
    sys.exit(main())
