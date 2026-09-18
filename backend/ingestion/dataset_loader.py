import json
import os
import hashlib
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
import numpy as np


class SampleItem:
    def __init__(
        self,
        sample_id: str,
        image_path: str,
        labels: List[str],
        boxes: List[List[float]],
        contributor_id: str = "contributor_unknown",
        batch_id: str = "batch_001",
        metadata: Optional[Dict[str, Any]] = None,
        image_array: Optional[np.ndarray] = None,
    ):
        self.sample_id = sample_id
        self.image_path = image_path
        self.labels = labels
        self.boxes = boxes
        self.contributor_id = contributor_id
        self.batch_id = batch_id
        self.metadata = metadata or {}
        self.image_array = image_array
        self._sha256: Optional[str] = None

    @property
    def sha256(self) -> str:
        if self._sha256 is None:
            if os.path.exists(self.image_path):
                hasher = hashlib.sha256()
                with open(self.image_path, "rb") as f:
                    while chunk := f.read(65536):
                        hasher.update(chunk)
                self._sha256 = hasher.hexdigest()
            elif self.image_array is not None:
                self._sha256 = hashlib.sha256(self.image_array.tobytes()).hexdigest()
            else:
                self._sha256 = hashlib.sha256(self.sample_id.encode()).hexdigest()
        return self._sha256


class DatasetLoader:
    @staticmethod
    def load_coco(coco_json_path: str, images_dir: Optional[str] = None) -> List[SampleItem]:
        with open(coco_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        category_map = {cat["id"]: cat["name"] for cat in data.get("categories", [])}
        images_dict = {img["id"]: img for img in data.get("images", [])}

        annotations_by_image: Dict[int, List[Dict[str, Any]]] = {}
        for ann in data.get("annotations", []):
            img_id = ann["image_id"]
            if img_id not in annotations_by_image:
                annotations_by_image[img_id] = []
            annotations_by_image[img_id].append(ann)

        # Structural keys that already have a dedicated field on SampleItem
        # (or are COCO's own bookkeeping) -- everything else a contributor
        # puts on an `images[]` or `annotations[]` entry is a genuine
        # declared-metadata claim (e.g. `has_trigger`, `poisoned`,
        # `true_label`, `label_flipped`, `is_ood`, `patch_location`,
        # `trigger_type`) that the data-assurance detectors (poisoning,
        # label, OOD) read via `sample.metadata.get(...)`. An earlier
        # version of this loader silently dropped every such field,
        # building `metadata` from a fixed allow-list only -- so a
        # contributor's declared ground truth, submitted the way this
        # project's own PS explicitly allows (metadata alongside the
        # imagery), never reached those detectors through the real
        # ingestion path at all; only tests that built `SampleItem`
        # directly in Python (bypassing this loader) ever exercised that
        # code. Passing everything else through is what makes the
        # metadata-declared evidence tier documented in COVERAGE.md
        # actually reachable from an uploaded COCO archive.
        _IMAGE_RESERVED_KEYS = {"id", "file_name", "width", "height", "contributor", "contributor_id", "batch", "batch_id"}
        _ANNOTATION_RESERVED_KEYS = {"id", "image_id", "category_id", "bbox", "area", "iscrowd"}

        samples: List[SampleItem] = []
        base_dir = images_dir or os.path.dirname(coco_json_path)

        for img_id, img_info in images_dict.items():
            filename = img_info.get("file_name", f"{img_id}.jpg")
            img_path = os.path.join(base_dir, filename)
            contributor = img_info.get("contributor") or img_info.get("contributor_id", "contributor_general")
            batch = img_info.get("batch") or img_info.get("batch_id", "batch_001")

            labels = []
            boxes = []
            declared_metadata: Dict[str, Any] = {}
            for ann in annotations_by_image.get(img_id, []):
                cat_name = category_map.get(ann["category_id"], f"class_{ann['category_id']}")
                labels.append(cat_name)
                boxes.append(ann.get("bbox", [0, 0, 0, 0]))
                for key, value in ann.items():
                    if key not in _ANNOTATION_RESERVED_KEYS:
                        declared_metadata[key] = value

            for key, value in img_info.items():
                if key not in _IMAGE_RESERVED_KEYS:
                    declared_metadata[key] = value

            sample = SampleItem(
                sample_id=f"coco_{img_id}",
                image_path=img_path,
                labels=labels,
                boxes=boxes,
                contributor_id=contributor,
                batch_id=batch,
                metadata={
                    "width": img_info.get("width", 640),
                    "height": img_info.get("height", 640),
                    "license": img_info.get("license", "unknown"),
                    "terrain": img_info.get("terrain", "plains"),
                    "sensor": img_info.get("sensor", "EO_optical"),
                    **declared_metadata,
                },
            )
            samples.append(sample)

        return samples

    @staticmethod
    def load_yolo(yolo_dir: str, class_names: Optional[List[str]] = None) -> List[SampleItem]:
        base_path = Path(yolo_dir)
        labels_dir = base_path / "labels" if (base_path / "labels").exists() else base_path
        images_dir = base_path / "images" if (base_path / "images").exists() else base_path

        samples: List[SampleItem] = []
        label_files = list(labels_dir.glob("*.txt"))

        for l_file in label_files:
            stem = l_file.stem
            img_candidates = list(images_dir.glob(f"{stem}.*"))
            img_path = str(img_candidates[0]) if img_candidates else str(images_dir / f"{stem}.jpg")

            labels = []
            boxes = []
            contributor = "contributor_general"
            batch = "batch_001"

            with open(l_file, "r", encoding="utf-8") as lf:
                for line in lf:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cls_idx = int(parts[0])
                        c_name = class_names[cls_idx] if class_names and cls_idx < len(class_names) else f"class_{cls_idx}"
                        labels.append(c_name)
                        boxes.append([float(p) for p in parts[1:5]])
                    elif line.startswith("# contributor:"):
                        contributor = line.split(":", 1)[1].strip()
                    elif line.startswith("# batch:"):
                        batch = line.split(":", 1)[1].strip()

            sample = SampleItem(
                sample_id=f"yolo_{stem}",
                image_path=img_path,
                labels=labels,
                boxes=boxes,
                contributor_id=contributor,
                batch_id=batch,
                metadata={"stem": stem},
            )
            samples.append(sample)

        return samples

    @staticmethod
    def validate_dataset_structure(samples: List[SampleItem]) -> Tuple[bool, List[str]]:
        errors = []
        if not samples:
            errors.append("Dataset contains zero valid sample items.")
            return False, errors

        for idx, sample in enumerate(samples):
            if not sample.labels:
                errors.append(f"Sample {sample.sample_id} at index {idx} contains no class labels.")
            if len(sample.labels) != len(sample.boxes):
                errors.append(f"Sample {sample.sample_id} has mismatched labels count ({len(sample.labels)}) and boxes count ({len(sample.boxes)}).")

        return len(errors) == 0, errors
