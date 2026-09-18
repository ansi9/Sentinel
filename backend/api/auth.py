import os
from typing import Dict, Optional
from fastapi import Header, HTTPException, Request

API_KEY_ENV_VAR = "IntelX_API_KEY"
API_KEYS_ENV_VAR = "IntelX_API_KEYS"

ROLE_ANALYST = "analyst"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_ANALYST, ROLE_ADMIN}


def _load_keyring() -> Dict[str, str]:
    """Resolves the configured API keys into {key: role}.

    Two ways to configure this, checked in order:
      - IntelX_API_KEYS: "key1:role1,key2:role2,..." for real multi-role
        access (e.g. one analyst key for routine use, one admin key kept
        separately for destructive operations).
      - IntelX_API_KEY (legacy, single shared secret): treated as one
        admin-role key, for backward compatibility with the original
        single-key MVP gate.

    Empty/unset (both) means auth is disabled entirely -- the PRD's
    stated single-analyst-workstation deployment model for the SIH
    prototype has no other users on the network path to this service.
    """
    multi = os.environ.get(API_KEYS_ENV_VAR)
    if multi:
        keyring: Dict[str, str] = {}
        for pair in multi.split(","):
            pair = pair.strip()
            if not pair or ":" not in pair:
                continue
            key, _, role = pair.partition(":")
            key, role = key.strip(), role.strip().lower()
            if key and role in VALID_ROLES:
                keyring[key] = role
        return keyring

    single = os.environ.get(API_KEY_ENV_VAR)
    if single:
        return {single: ROLE_ADMIN}

    return {}


def require_api_key(request: Request, x_api_key: str = Header(default=None)) -> Optional[str]:
    """Authentication gate. See `_load_keyring` for how roles are
    configured.

    This is a deliberately lightweight MVP control, not the full "local
    role-based access control" the PRD names as Phase 1 scale-up work
    (section 17) -- there is no per-analyst identity, session, or
    provisioning workflow, just a small number of shared role-scoped
    secrets. It does distinguish `analyst` (read + run assurance
    workflows) from `admin` (also destructive operations, e.g. purging
    raw uploads) via `require_role`, which is real, enforced role
    separation, not merely documented intent.

    Returns the resolved role (or None if auth is disabled entirely) and
    stashes it on `request.state.role` so `require_role` can check it
    without re-parsing the header.
    """
    keyring = _load_keyring()
    if not keyring:
        request.state.role = None
        return None

    role = keyring.get(x_api_key) if x_api_key else None
    if role is None:
        raise HTTPException(
            status_code=401,
            detail=f"Missing or invalid API key. Set the 'X-API-Key' header to a key configured via "
            f"{API_KEYS_ENV_VAR} (preferred, supports roles) or {API_KEY_ENV_VAR} (legacy, admin-only).",
        )

    request.state.role = role
    return role


def require_role(required_role: str):
    """Dependency factory for an endpoint that additionally needs a
    specific role once past `require_api_key`. When auth is disabled
    entirely (no keys configured), every role check passes -- consistent
    with the rest of this gate's "no configured keys = single-workstation,
    no other users" posture, not a bypass specific to this function."""

    def _check(request: Request) -> None:
        role = getattr(request.state, "role", None)
        keyring = _load_keyring()
        if not keyring:
            return
        if role != required_role:
            raise HTTPException(
                status_code=403,
                detail=f"This action requires the '{required_role}' role; the presented key has role "
                f"'{role}'.",
            )

    return _check
