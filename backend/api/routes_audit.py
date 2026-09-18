from fastapi import APIRouter
from ..audit.audit_log import shared_ledger

router = APIRouter(prefix="/api/audit", tags=["Tamper-Evident Audit"])


@router.get("/entries")
async def get_audit_entries():
    is_valid, errors = shared_ledger.verify_ledger_integrity()
    return {
        "entries": shared_ledger.get_entries(),
        "total_entries": len(shared_ledger.entries),
        "chain_digest": shared_ledger.current_chain_digest,
        "is_chain_valid": is_valid,
        "verification_errors": errors,
    }


@router.post("/verify")
async def verify_audit_ledger():
    is_valid, errors = shared_ledger.verify_ledger_integrity()
    return {
        "is_chain_valid": is_valid,
        "chain_digest": shared_ledger.current_chain_digest,
        "errors": errors,
        "status": "VALID_TAMPER_EVIDENT_LEDGER" if is_valid else "CHAIN_INTEGRITY_VIOLATION",
    }
