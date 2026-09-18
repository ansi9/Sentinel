#!/usr/bin/env python3
"""Offline key-rotation CLI for IntelX's two Ed25519 signing roles
("provenance" for inference records, "audit" for the tamper-evident
ledger). Run this periodically (or immediately after any suspected key
compromise) as part of routine operational hygiene -- the PRD's own
scale-up plan (section 17, Phase 1) names "signing-key rotation ...
procedures" as required hardening beyond the SIH prototype baseline;
this is that procedure.

Rotation never invalidates history: every previously-issued signature
(inference records already on disk, audit-ledger entries already
appended) remains verifiable afterward, because retired public keys stay
in the key registry and `ProvenanceSigner.verify_signature` checks against
all of them, not just the currently active one. Verify this yourself with:
    python -m backend.tools.verify_offline audit
    python -m backend.tools.verify_offline all
before and after a rotation -- both must report VALID.

Usage:
    python -m backend.tools.rotate_keys provenance
    python -m backend.tools.rotate_keys audit
    python -m backend.tools.rotate_keys all
    python -m backend.tools.rotate_keys --status
"""
import argparse
import sys

from ..audit.audit_log import shared_ledger
from ..provenance.key_registry import KeyRegistry
from ..provenance.signing import DEFAULT_KEY_PATH, DEFAULT_KEY_REGISTRY_PATH, ProvenanceSigner
from ..audit.audit_log import DEFAULT_AUDIT_KEY_PATH


ROLE_KEY_PATHS = {
    "provenance": DEFAULT_KEY_PATH,
    "audit": DEFAULT_AUDIT_KEY_PATH,
}


def rotate_role(role: str) -> str:
    signer = ProvenanceSigner(key_path=ROLE_KEY_PATHS[role], role=role)
    old_fingerprint = signer.public_key_hex
    new_fingerprint = signer.rotate()

    shared_ledger.record_event(
        "KEY_ROTATION", f"signing_key:{role}", "ROTATE_ED25519_KEY", new_fingerprint,
        "COMPLETED",
        f"Rotated {role} signing key. Retired key fingerprint: {old_fingerprint[:16]}... "
        f"New active key fingerprint: {new_fingerprint[:16]}... "
        "Retired key remains registered and valid for verifying pre-rotation signatures.",
    )
    return new_fingerprint


def print_status() -> None:
    registry = KeyRegistry(DEFAULT_KEY_REGISTRY_PATH)
    for role in ROLE_KEY_PATHS:
        history = registry.history_for_role(role)
        print(f"\n[{role}]")
        if not history:
            print("  No keys registered yet (will be created on first use).")
            continue
        for entry in history:
            status = "ACTIVE" if entry["retired_at"] is None else f"retired {entry['retired_at']}"
            print(f"  {entry['public_key_hex'][:24]}...  created {entry['created_at']}  [{status}]")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Rotate IntelX Ed25519 signing keys.")
    parser.add_argument(
        "role", nargs="?", choices=["provenance", "audit", "all"],
        help="Which signing role to rotate.",
    )
    parser.add_argument("--status", action="store_true", help="Show key registry status and exit.")
    args = parser.parse_args(argv)

    if args.status or not args.role:
        print_status()
        return 0

    roles = ["provenance", "audit"] if args.role == "all" else [args.role]
    for role in roles:
        new_fp = rotate_role(role)
        print(f"Rotated {role} signing key. New active fingerprint: {new_fp}")

    print("\nVerify nothing broke:")
    print("  python -m backend.tools.verify_offline all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
