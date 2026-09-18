from typing import Optional
from fastapi import APIRouter, Depends
from .auth import require_api_key

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.get("/whoami")
async def whoami(role: Optional[str] = Depends(require_api_key)):
    """Lets the frontend verify a station operator's API key against the
    real backend RBAC gate (see api/auth.py) before granting access, and
    learn which role it resolved to. `require_api_key` already rejects a
    missing/invalid key with 401 when auth is configured, so a 200 response
    here always means either the presented key is valid (`role` set) or
    this deployment has no keys configured at all (`role` is None --
    the single-workstation, no-other-users posture documented in api/auth.py)."""
    return {"authenticated": True, "role": role}
