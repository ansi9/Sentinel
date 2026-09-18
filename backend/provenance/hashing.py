import hashlib
import json
import os
from typing import Any, Dict, List
from ..schemas import BoundingBox, InferenceConfig, PreprocessingConfig


class ProvenanceHasher:
    @staticmethod
    def hash_image_file(image_path: str) -> str:
        """Hashes the actual image bytes. Deliberately has no fallback for a
        missing file: a provenance record's whole purpose is binding to the
        real input, so hashing the path string instead would produce a
        cryptographic binding to nothing."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Cannot bind provenance record: image not found at {image_path}")
        hasher = hashlib.sha256()
        with open(image_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    @staticmethod
    def hash_preprocessing_config(config: PreprocessingConfig) -> str:
        canonical_str = json.dumps(config.model_dump(), sort_keys=True)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    @staticmethod
    def hash_inference_config(config: InferenceConfig) -> str:
        canonical_str = json.dumps(config.model_dump(), sort_keys=True)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    @staticmethod
    def hash_predictions(predictions: List[BoundingBox]) -> str:
        pred_dicts = [p.model_dump() for p in predictions]
        # Sort on every field, not just (class_name, confidence): two
        # predictions tied on those two but differing in box coordinates
        # would otherwise retain their original (Python sort is stable)
        # relative order, making the canonicalization order-dependent for
        # that tie case. Sorting on the box too makes the ordering fully
        # determined by content, independent of input order.
        pred_dicts.sort(key=lambda x: (x["class_name"], x["confidence"], x["box"]))
        canonical_str = json.dumps(pred_dicts, sort_keys=True)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    @staticmethod
    def hash_metadata(metadata: Dict[str, Any]) -> str:
        canonical_str = json.dumps(metadata or {}, sort_keys=True, default=str)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    @staticmethod
    def compute_provenance_hash(
        image_hash: str,
        model_digest: str,
        preprocessing_hash: str,
        config_hash: str,
        output_hash: str,
        timestamp: str,
        nonce: str,
        sequence_number: int,
        model_id: str = "",
        metadata_hash: str = "",
    ) -> str:
        """Binds every field the system claims an inference record's
        cryptographic identity covers. `model_id` and `metadata_hash`
        (a hash of `image_metadata`) were historically omitted here, which
        meant a validly-signed record's declared model identity or image
        provenance metadata could be altered post-issuance without
        invalidating the hash or signature -- silently breaking the "input
        image, model identifier ... and resulting output" binding this
        system exists to provide. `model_id`/`metadata_hash` default to ""
        only so old call sites that haven't been updated don't crash; real
        callers must always pass both."""
        combined = (
            f"{image_hash}:"
            f"{model_digest}:"
            f"{model_id}:"
            f"{preprocessing_hash}:"
            f"{config_hash}:"
            f"{output_hash}:"
            f"{metadata_hash}:"
            f"{timestamp}:"
            f"{nonce}:"
            f"{sequence_number}"
        )
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()
