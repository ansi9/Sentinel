import os
from typing import Tuple
import numpy as np
from PIL import Image


def extract_color_moment_features(image_path: str) -> Tuple[np.ndarray, bool]:
    """Returns (features, computed_from_real_pixels). The fallback path
    (image missing/unreadable) produces a deterministic-but-fabricated
    feature vector purely so one bad file doesn't crash a dataset-wide
    scan -- it carries no real color-distribution signal, and callers
    must track and surface `computed_from_real_pixels=False` rather than
    silently folding it into genuine evidence. Shared by OODDetector and
    LabelAnalyzer so both operate on the same real-pixel feature space."""
    try:
        if os.path.exists(image_path):
            with Image.open(image_path) as img:
                img_rgb = img.convert("RGB").resize((128, 128))
                arr = np.asarray(img_rgb, dtype=np.float32) / 255.0
                mean = np.mean(arr, axis=(0, 1))
                std = np.std(arr, axis=(0, 1))
                return np.concatenate([mean, std]), True
    except Exception:
        pass

    seed = int.from_bytes(image_path.encode()[:4].ljust(4, b"\0"), "little")
    rng = np.random.RandomState(seed % 100000)
    return rng.normal(0.5, 0.15, size=(6,)), False
