import os
import re
import uuid
from typing import Tuple
from fastapi import UploadFile

# backend/ingestion/upload_store.py -> backend/ingestion -> backend -> repo
# root. The default is anchored on __file__, not left as a bare relative
# name, so every consumer (this module, routes_uploads.py, routes_dataset.py,
# path_safety.py's sandbox check) resolves the same physical directory
# regardless of the server process's current working directory. An
# operator-supplied IntelX_UPLOAD_DIR is respected as given (absolute or
# relative-to-cwd, at the operator's discretion).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_ROOT = os.environ.get("IntelX_UPLOAD_DIR", os.path.join(_REPO_ROOT, "uploads"))
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200MB, generous for single ONNX/PyTorch weight files


def _safe_suffix(filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if re.fullmatch(r"\.[a-z0-9]{1,12}", ext or "") else ""


async def save_upload(upload: UploadFile, subdir: str) -> Tuple[str, int]:
    """Streams an uploaded file to disk under UPLOAD_ROOT/subdir with a
    random, collision-free name, enforcing a size cap. Returns
    (saved_path, size_bytes). This is the only path by which real,
    user-supplied dataset/model/image bytes enter the system for analysis."""
    target_dir = os.path.join(UPLOAD_ROOT, subdir)
    os.makedirs(target_dir, exist_ok=True)

    dest_name = f"{uuid.uuid4().hex}{_safe_suffix(upload.filename or '')}"
    dest_path = os.path.join(target_dir, dest_name)

    total = 0
    with open(dest_path, "wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                out.close()
                os.remove(dest_path)
                raise ValueError(f"Upload exceeds maximum allowed size of {MAX_UPLOAD_BYTES} bytes.")
            out.write(chunk)

    return dest_path, total
