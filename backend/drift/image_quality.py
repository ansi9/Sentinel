import os
from typing import Any, Dict, Optional
import numpy as np
from PIL import Image


def _load_grayscale(image_path: str, max_dim: int = 256) -> Optional[np.ndarray]:
    try:
        with Image.open(image_path) as img:
            img_gray = img.convert("L")
            w, h = img_gray.size
            scale = min(1.0, max_dim / max(w, h)) if max(w, h) > max_dim else 1.0
            if scale < 1.0:
                img_gray = img_gray.resize((max(1, int(w * scale)), max(1, int(h * scale))))
            return np.asarray(img_gray, dtype=np.float64)
    except Exception:
        return None


def _laplacian_variance(gray: np.ndarray) -> float:
    """Variance of the Laplacian -- a standard, dependency-free blur proxy:
    sharp edges produce large second-derivative magnitude, so a blurred
    image has a low-variance Laplacian response."""
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    if gray.shape[0] < 3 or gray.shape[1] < 3:
        return 0.0
    padded = np.pad(gray, 1, mode="edge")
    lap = (
        kernel[0, 1] * padded[0:-2, 1:-1]
        + kernel[1, 0] * padded[1:-1, 0:-2]
        + kernel[1, 1] * padded[1:-1, 1:-1]
        + kernel[1, 2] * padded[1:-1, 2:]
        + kernel[2, 1] * padded[2:, 1:-1]
    )
    return float(np.var(lap))


def _blockiness_score(gray: np.ndarray, block_size: int = 8) -> float:
    """Estimates JPEG-style compression blocking artifacts by comparing
    pixel discontinuity magnitude at 8x8 block boundaries against
    discontinuity magnitude elsewhere. A higher ratio indicates stronger
    block-edge artifacts consistent with lossy re-compression."""
    h, w = gray.shape
    if h < block_size * 2 or w < block_size * 2:
        return 0.0

    col_diffs = np.abs(np.diff(gray, axis=1))
    row_diffs = np.abs(np.diff(gray, axis=0))

    boundary_cols = [c for c in range(block_size - 1, w - 1, block_size)]
    boundary_rows = [r for r in range(block_size - 1, h - 1, block_size)]
    if not boundary_cols or not boundary_rows:
        return 0.0

    boundary_col_energy = float(np.mean(col_diffs[:, boundary_cols])) if boundary_cols else 0.0
    boundary_row_energy = float(np.mean(row_diffs[boundary_rows, :])) if boundary_rows else 0.0
    overall_energy = float(np.mean(col_diffs)) + float(np.mean(row_diffs)) + 1e-6

    boundary_energy = boundary_col_energy + boundary_row_energy
    return float(round(boundary_energy / overall_energy, 4))


def compute_image_quality_signals(image_path: str) -> Optional[Dict[str, Any]]:
    """Computes real, pixel-derived image-quality signals for one image:
    resolution, blur (Laplacian variance), contrast (intensity std-dev),
    and an estimated compression-blockiness score. Returns None when the
    image cannot be read, so callers can fall back gracefully rather than
    fabricating values."""
    if not image_path or not os.path.exists(image_path):
        return None

    gray = _load_grayscale(image_path)
    if gray is None:
        return None

    try:
        with Image.open(image_path) as img:
            width, height = img.size
    except Exception:
        width, height = gray.shape[1], gray.shape[0]

    return {
        "resolution_px": int(width * height),
        "width": int(width),
        "height": int(height),
        "blur_score": round(_laplacian_variance(gray), 3),
        "contrast_score": round(float(np.std(gray)), 3),
        "compression_blockiness": _blockiness_score(gray),
    }
