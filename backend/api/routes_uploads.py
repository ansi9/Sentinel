import base64
import binascii
import os
import shutil
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from ..audit.audit_log import shared_ledger
from ..ingestion.upload_store import UPLOAD_ROOT
from ..persistence import db
from .auth import ROLE_ADMIN, require_role

router = APIRouter(prefix="/api/uploads", tags=["Raw Upload Management"])

# Every raw-upload entry point (`/api/model/upload`, `/api/dataset/upload`,
# `/api/inference/upload-image`) writes under one of these UPLOAD_ROOT
# subdirectories. "datasets" holds whole extracted-archive directories
# (one directory per upload), the rest hold individual files. Listing and
# deletion both operate at this granularity -- one entry per actual upload
# action, not per file inside an extracted archive.
_CATEGORY_SUBDIRS = ["models", "dataset_archives", "images", "datasets"]


def _upload_root_real() -> str:
    os.makedirs(UPLOAD_ROOT, exist_ok=True)
    return os.path.realpath(UPLOAD_ROOT)


def _encode_id(relative_path: str) -> str:
    return base64.urlsafe_b64encode(relative_path.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_id(upload_id: str) -> str:
    padded = upload_id + "=" * (-len(upload_id) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        raise HTTPException(status_code=404, detail="Malformed upload id.")


def _resolve_entry(upload_id: str) -> Dict[str, str]:
    """Decodes an opaque upload id back to a filesystem path and verifies
    -- via realpath, so a symlink can't be used to escape -- that the
    result still lives strictly inside UPLOAD_ROOT. This is the single
    choke point every read/delete goes through; nothing in this router
    ever takes a raw filesystem path from the caller.

    Returns both `storage_path` (built the same way save_upload() builds
    paths -- os.path.join(UPLOAD_ROOT, ...), NOT realpath'd) and
    `real_path` (fully resolved, used only for the traversal check and
    filesystem operations). model_records.saved_path and the JSON blobs
    in the other tables were written using the storage-path form, so
    reference lookups must match against that, not the resolved form."""
    root_real = _upload_root_real()
    relative_path = _decode_id(upload_id)

    category = relative_path.split(os.sep, 1)[0] if os.sep in relative_path else relative_path
    if category not in _CATEGORY_SUBDIRS:
        raise HTTPException(status_code=404, detail="Unknown upload id.")

    storage_path = os.path.join(UPLOAD_ROOT, relative_path)
    real_path = os.path.realpath(os.path.join(root_real, relative_path))
    if real_path != root_real and not real_path.startswith(root_real + os.sep):
        raise HTTPException(status_code=404, detail="Unknown upload id.")
    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="Upload no longer exists.")

    return {
        "root": root_real,
        "relative_path": relative_path,
        "storage_path": storage_path,
        "real_path": real_path,
        "category": category,
    }


def _dir_size(path: str) -> int:
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.isfile(fp):
                total += os.path.getsize(fp)
    return total


def _list_category_entries(root_real: str, category: str) -> List[Dict[str, Any]]:
    category_dir_real = os.path.join(root_real, category)
    if not os.path.isdir(category_dir_real):
        return []

    entries = []
    for name in sorted(os.listdir(category_dir_real)):
        real_path = os.path.join(category_dir_real, name)
        relative_path = os.path.join(category, name)
        # Matches exactly how save_upload() / routes_dataset.py build the
        # path strings that get written into saved_path / JSON blobs.
        storage_path = os.path.join(UPLOAD_ROOT, relative_path)

        is_dir = os.path.isdir(real_path)
        size_bytes = _dir_size(real_path) if is_dir else os.path.getsize(real_path)
        stat = os.stat(real_path)

        references = db.find_references_to_path(storage_path)
        entries.append({
            "id": _encode_id(relative_path),
            "category": category,
            "name": name,
            "is_directory": is_dir,
            "size_bytes": size_bytes,
            "modified_at": stat.st_mtime,
            "referenced_by": references,
            "deletable": len(references) == 0,
        })
    return entries


@router.get("/")
async def list_uploads():
    """Lists every raw upload currently staged on disk (model weights,
    dataset archives/extracted directories, probe images) -- the surface
    that previously had zero API-level visibility. Each entry reports
    whether any persisted evidence record still references it
    (`referenced_by`); only entries with `deletable: true` can actually be
    removed via DELETE below."""
    root = _upload_root_real()
    all_entries: List[Dict[str, Any]] = []
    for category in _CATEGORY_SUBDIRS:
        all_entries.extend(_list_category_entries(root, category))

    total_bytes = sum(e["size_bytes"] for e in all_entries)
    return {
        "uploads": all_entries,
        "total_count": len(all_entries),
        "total_bytes": total_bytes,
        "referenced_count": sum(1 for e in all_entries if not e["deletable"]),
    }


@router.delete("/{upload_id}", dependencies=[Depends(require_role(ROLE_ADMIN))])
async def delete_upload(upload_id: str):
    """Permanently deletes one raw-upload entry (a single uploaded file,
    or an entire extracted dataset directory). Refuses -- 409, not a
    silent no-op -- if any persisted evidence record (a model fingerprint,
    dataset analysis, inference record, or assurance report) still
    references this path: deleting an artifact that generated evidence
    depends on would make that evidence unable to be re-verified later,
    which this system exists to prevent. The deletion itself is recorded
    in the tamper-evident audit ledger like every other mutating action."""
    entry = _resolve_entry(upload_id)
    real_path = entry["real_path"]

    references = db.find_references_to_path(entry["storage_path"])
    if references:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Cannot delete: this upload is referenced by persisted evidence and would break "
                "re-verification of that evidence.",
                "referenced_by": references,
            },
        )

    size_bytes = _dir_size(real_path) if os.path.isdir(real_path) else os.path.getsize(real_path)
    is_dir = os.path.isdir(real_path)

    if is_dir:
        shutil.rmtree(real_path)
    else:
        os.remove(real_path)

    shared_ledger.record_event(
        "UPLOAD_DELETED", entry["relative_path"], "PURGE_RAW_UPLOAD", upload_id,
        "COMPLETED", f"Deleted unreferenced {'directory' if is_dir else 'file'} "
        f"'{entry['relative_path']}' ({size_bytes} bytes)."
    )

    return {
        "deleted": entry["relative_path"],
        "category": entry["category"],
        "size_bytes": size_bytes,
    }
