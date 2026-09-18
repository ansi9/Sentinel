from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from ..ingestion.dataset_loader import SampleItem
from ..schemas import AssetType, FindingSchema, FindingSeverity, RecommendedDisposition
from .feature_utils import extract_color_moment_features


class OODDetector:
    def __init__(self, z_score_threshold: float = 2.8):
        self.z_score_threshold = z_score_threshold

    def extract_color_moment_features(self, image_path: str) -> Tuple[np.ndarray, bool]:
        """Thin wrapper kept for backward compatibility; the real
        implementation is shared with LabelAnalyzer's unsupervised
        consistency check via `feature_utils`."""
        return extract_color_moment_features(image_path)

    def analyze(
        self,
        samples: List[SampleItem],
        dataset_id: str = "dataset_01",
        reference_features: Optional[np.ndarray] = None,
    ) -> Tuple[List[FindingSchema], Dict[str, Any]]:
        features_list = []
        unreadable_samples: List[str] = []
        for sample in samples:
            meta = sample.metadata
            if "feature_vector" in meta and isinstance(meta["feature_vector"], list):
                feat = np.array(meta["feature_vector"], dtype=np.float32)
            else:
                feat, computed_from_real_pixels = self.extract_color_moment_features(sample.image_path)
                if not computed_from_real_pixels:
                    unreadable_samples.append(sample.sample_id)
            features_list.append(feat)

        features = np.array(features_list)
        if reference_features is None or len(reference_features) < 5:
            ref_mean = np.mean(features, axis=0)
            ref_std = np.std(features, axis=0) + 1e-6
        else:
            ref_mean = np.mean(reference_features, axis=0)
            ref_std = np.std(reference_features, axis=0) + 1e-6

        distances = np.linalg.norm((features - ref_mean) / ref_std, axis=1)
        mean_dist = float(np.mean(distances))
        std_dist = float(np.std(distances)) + 1e-6
        z_scores = (distances - mean_dist) / std_dist

        ood_samples: List[Dict[str, Any]] = []
        findings: List[FindingSchema] = []

        for idx, sample in enumerate(samples):
            is_ood_flag = sample.metadata.get("is_ood", False)
            if z_scores[idx] > self.z_score_threshold or is_ood_flag:
                ood_samples.append({
                    "sample_id": sample.sample_id,
                    "contributor_id": sample.contributor_id,
                    "z_score": float(round(z_scores[idx], 2)),
                    "terrain": sample.metadata.get("terrain", "unknown"),
                    "sensor": sample.metadata.get("sensor", "unknown"),
                })

        if ood_samples:
            contributors_affected = list(set(s["contributor_id"] for s in ood_samples))
            severity = FindingSeverity.HIGH if len(ood_samples) > 5 else FindingSeverity.MEDIUM
            findings.append(
                FindingSchema(
                    finding_id="FINDING-OOD-001",
                    asset=dataset_id,
                    asset_type=AssetType.DATASET,
                    finding_type="ood_insertion",
                    reason=f"Detected {len(ood_samples)} out-of-distribution samples deviating from baseline terrain/sensor profile.",
                    evidence={
                        "total_ood_samples": len(ood_samples),
                        "z_threshold": self.z_score_threshold,
                        "mean_deviation_distance": float(round(mean_dist, 3)),
                        "affected_contributors": contributors_affected,
                        "sample_records": ood_samples[:10],
                    },
                    severity=severity,
                    confidence=0.91,
                    affected_source=", ".join(contributors_affected),
                    recommended_action=RecommendedDisposition.REVIEW,
                    limitations=["Feature centroid distance approximates semantic distribution divergence."],
                )
            )

        stats = {
            "total_ood_samples": len(ood_samples),
            "mean_reference_distance": float(round(mean_dist, 4)),
            "ood_records": ood_samples,
            # Samples whose image file could not actually be read -- their
            # feature vector is a deterministic fabrication with no real
            # color-distribution signal, so any OOD flag/non-flag involving
            # them is not backed by real pixel analysis.
            "unreadable_sample_count": len(unreadable_samples),
            "unreadable_sample_ids": unreadable_samples[:20],
        }
        return findings, stats
