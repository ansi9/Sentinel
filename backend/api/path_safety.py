"""Shared containment check for every API endpoint that accepts a
"server-local path" string from a caller (model/dataset/image paths for
the Live Analysis workflow).

Without this, a client could pass `model_path="/etc/passwd"` or any other
host-readable path and have it opened/hashed/parsed directly -- these
endpoints exist so an analyst can point the pipeline at a file already
staged on this workstation, not to expose arbitrary filesystem read.

`routes_uploads.py` already solved this for its own opaque upload ids via
`_resolve_entry()`'s realpath-containment check. This module is the same
check, generalized for endpoints that take a raw path string rather than
an opaque id, and scoped to the directories this deployment actually
declares as legitimate sources: uploaded files, the bundled scenario
fixtures, and the real-world validation fixtures.
"""
import os
from typing import List
from fastapi import HTTPException

from ..ingestion.upload_store import UPLOAD_ROOT

# backend/api/path_safety.py -> backend/api -> backend -> repo root. Anchoring
# on __file__ instead of a bare relative name means these roots resolve to the
# same directories regardless of the server process's current working
# directory (a systemd unit, a different launch script, or a container
# WORKDIR could otherwise silently point the "safe" sandbox somewhere else,
# or deny fixtures that do exist).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _anchor(root: str) -> str:
    """Relative roots are resolved against the repo root; an operator-supplied
    absolute path (e.g. IntelX_UPLOAD_DIR) is respected as given."""
    return root if os.path.isabs(root) else os.path.join(_REPO_ROOT, root)


# Every directory a "server-local path" is legitimately allowed to resolve
# inside. Anything outside all of these is refused, regardless of whether
# the file exists or is readable.
ALLOWED_ROOT_DIRS: List[str] = [
    UPLOAD_ROOT,
    "test_assets",
    "real_validation",
]


def _allowed_roots_real() -> List[str]:
    roots = []
    for root in ALLOWED_ROOT_DIRS:
        anchored = _anchor(root)
        if root == UPLOAD_ROOT:
            os.makedirs(anchored, exist_ok=True)
        roots.append(os.path.realpath(anchored))
    return roots


def resolve_safe_path(path: str, description: str = "path") -> str:
    """Verifies that `path` resolves (via realpath, so a symlink can't be
    used to escape) strictly inside one of the declared safe roots.
    Returns the original path unchanged for use by the caller; raises a
    403 HTTPException otherwise. Must be called BEFORE any filesystem
    access (os.path.exists, open, onnx.load, etc.) on a client-supplied
    path -- it is the single choke point these endpoints have."""
    if not path:
        raise HTTPException(status_code=422, detail=f"{description} must not be empty.")

    real_path = os.path.realpath(path)
    for root in _allowed_roots_real():
        if real_path == root or real_path.startswith(root + os.sep):
            return path

    raise HTTPException(
        status_code=403,
        detail=(
            f"{description} must resolve inside one of the permitted directories "
            f"({', '.join(ALLOWED_ROOT_DIRS)}); refusing to access a path outside "
            "the analysis sandbox."
        ),
    )
