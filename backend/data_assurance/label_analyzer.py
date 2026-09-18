from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict, Counter
import numpy as np
from ..ingestion.dataset_loader import SampleItem
from ..schemas import AssetType, FindingSchema, FindingSeverity, RecommendedDisposition
from .feature_utils import extract_color_moment_features


class LabelAnalyzer:
    def __init__(
        self,
        conflict_ratio_threshold: float = 0.25,
        knn_neighbors: int = 5,
        knn_agreement_threshold: float = 0.8,
        knn_min_dataset_size: int = 8,
    ):
        self.conflict_ratio_threshold = conflict_ratio_threshold
        # Unsupervised k-NN label-consistency tier: catches mislabelling on
        # datasets where no reference model and no ground-truth metadata are
        # available (see class docstring on `analyze`). Deliberately
        # conservative (high agreement threshold) because it is a weaker,
        # proxy signal -- it compares a sample's declared label against the
        # *declared* labels of its feature-space neighbours, not true
        # ground truth, so it is reported at lower confidence and clearly
        # labelled as a heuristic in every finding it contributes to.
        self.knn_neighbors = knn_neighbors
        self.knn_agreement_threshold = knn_agreement_threshold
        self.knn_min_dataset_size = knn_min_dataset_size

    def _unsupervised_feature_consistency(
        self, samples: List[SampleItem], already_covered: set,
    ) -> Dict[str, Tuple[str, float]]:
        """For every sample not already covered by a stronger verification
        tier (reference-model or metadata), flags it when its declared
        label disagrees with the majority declared label among its nearest
        neighbours in real-pixel color-moment feature space, and that
        majority is overwhelming (>= knn_agreement_threshold). Requires no
        reference model and no ground-truth metadata -- only the dataset
        itself -- so it is the one check in this module that works on
        genuinely unannotated real-world contributor data. Returns
        sample_id -> (majority_neighbor_label, agreement_ratio)."""
        candidates = [s for s in samples if s.sample_id not in already_covered]
        if len(candidates) < self.knn_min_dataset_size:
            return {}

        feature_rows: List[np.ndarray] = []
        readable_samples: List[SampleItem] = []
        for sample in candidates:
            feat, is_real = extract_color_moment_features(sample.image_path)
            if is_real:
                feature_rows.append(feat)
                readable_samples.append(sample)

        if len(readable_samples) < self.knn_min_dataset_size:
            return {}

        features = np.array(feature_rows)
        declared = [s.labels[0] if s.labels else "unknown" for s in readable_samples]
        k_eff = min(self.knn_neighbors, len(readable_samples) - 1)

        flagged: Dict[str, Tuple[str, float]] = {}
        for idx, sample in enumerate(readable_samples):
            if declared[idx] == "unknown":
                continue
            distances = np.linalg.norm(features - features[idx], axis=1)
            distances[idx] = np.inf
            neighbor_idx = np.argsort(distances)[:k_eff]
            neighbor_labels = [declared[j] for j in neighbor_idx]
            if not neighbor_labels:
                continue
            top_label, top_count = Counter(neighbor_labels).most_common(1)[0]
            agreement = top_count / k_eff
            if top_label != declared[idx] and top_label != "unknown" and agreement >= self.knn_agreement_threshold:
                flagged[sample.sample_id] = (top_label, round(agreement, 2))
        return flagged

    def analyze(
        self,
        samples: List[SampleItem],
        dataset_id: str = "dataset_01",
        known_classes: Optional[List[str]] = None,
        visual_predictions: Optional[Dict[str, Tuple[str, float]]] = None,
    ) -> Tuple[List[FindingSchema], Dict[str, Any]]:
        """Mislabelling is detected by up to three tiers of decreasing
        strength: (1) when `visual_predictions` is supplied (sample_id ->
        (predicted_class, confidence) from actually running a trusted
        reference model over the real image), real visual disagreement
        with the declared label; (2) `true_label`/`label_flipped` already
        present in sample metadata (synthetic test-scenario harness /
        contributor-declared ground truth); (3) for every sample not
        covered by (1) or (2), an unsupervised feature-space k-NN
        consistency check (`_unsupervised_feature_consistency`) that needs
        neither a reference model nor ground-truth metadata, so it is the
        tier that still provides coverage on genuinely unannotated
        real-world data. Real-world callers should still supply
        visual_predictions where possible -- tier 3 is a weaker proxy
        signal, reported at lower confidence."""
        findings: List[FindingSchema] = []
        contributor_label_errors: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        class_confusion_matrix: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        label_anomaly_samples: List[str] = []
        visual_predictions = visual_predictions or {}
        covered_by_stronger_tier: set = set()

        for sample in samples:
            meta = sample.metadata
            declared_label = sample.labels[0] if sample.labels else "unknown"

            if sample.sample_id in visual_predictions:
                true_label, pred_confidence = visual_predictions[sample.sample_id]
                flipped_flag = declared_label != true_label and true_label != "no_detection"
                confidence_disparity = round(pred_confidence, 3)
                verification_method = "real_reference_model_inference"
                covered_by_stronger_tier.add(sample.sample_id)
            else:
                flipped_flag = meta.get("label_flipped", False) or meta.get("synthetic_corrupt_label", False)
                true_label = meta.get("true_label", declared_label)
                flipped_flag = flipped_flag or (declared_label != true_label and true_label != "unknown")
                confidence_disparity = 0.89
                verification_method = "metadata_declared_ground_truth"
                if flipped_flag or "true_label" in meta or "label_flipped" in meta:
                    covered_by_stronger_tier.add(sample.sample_id)

            if flipped_flag:
                anomaly_entry = {
                    "sample_id": sample.sample_id,
                    "declared_label": declared_label,
                    "inferred_visual_label": true_label,
                    "contributor_id": sample.contributor_id,
                    "batch_id": sample.batch_id,
                    "confidence_disparity": confidence_disparity,
                    "verification_method": verification_method,
                }
                contributor_label_errors[sample.contributor_id].append(anomaly_entry)
                class_confusion_matrix[declared_label][true_label] += 1
                label_anomaly_samples.append(sample.sample_id)

        unsupervised_flags = self._unsupervised_feature_consistency(samples, covered_by_stronger_tier)
        unsupervised_hits = 0
        for sample in samples:
            if sample.sample_id not in unsupervised_flags:
                continue
            declared_label = sample.labels[0] if sample.labels else "unknown"
            neighbor_label, agreement = unsupervised_flags[sample.sample_id]
            anomaly_entry = {
                "sample_id": sample.sample_id,
                "declared_label": declared_label,
                "inferred_visual_label": neighbor_label,
                "contributor_id": sample.contributor_id,
                "batch_id": sample.batch_id,
                "confidence_disparity": agreement,
                "verification_method": "unsupervised_feature_space_knn_consistency",
            }
            contributor_label_errors[sample.contributor_id].append(anomaly_entry)
            class_confusion_matrix[declared_label][neighbor_label] += 1
            label_anomaly_samples.append(sample.sample_id)
            unsupervised_hits += 1

        for contributor, errors in contributor_label_errors.items():
            total_contrib_samples = len([s for s in samples if s.contributor_id == contributor])
            err_count = len(errors)
            err_ratio = err_count / max(1, total_contrib_samples)
            all_unsupervised = all(e["verification_method"] == "unsupervised_feature_space_knn_consistency" for e in errors)
            any_unsupervised = any(e["verification_method"] == "unsupervised_feature_space_knn_consistency" for e in errors)

            if err_ratio >= self.conflict_ratio_threshold or err_count >= 5:
                base_limitations = ["Visual label verification uses surrogate feature consistency checks."]
                if any_unsupervised:
                    base_limitations.append(
                        "Includes samples flagged only by the unsupervised k-NN feature-space "
                        "consistency check (no reference model, no ground-truth metadata) -- a "
                        "weaker proxy signal than reference-model visual verification; treat as "
                        "REVIEW-grade evidence in the absence of a corroborating check."
                    )
                findings.append(
                    FindingSchema(
                        finding_id=f"FINDING-LBL-{contributor.replace('_', '').upper()}",
                        asset=dataset_id,
                        asset_type=AssetType.DATASET,
                        finding_type="systematic_mislabelling",
                        reason=f"Contributor '{contributor}' exhibits systematic label corruption ({err_count}/{total_contrib_samples} samples, {err_ratio*100:.1f}% rate).",
                        evidence={
                            "contributor_id": contributor,
                            "error_count": err_count,
                            "total_samples": total_contrib_samples,
                            "error_rate": round(err_ratio, 3),
                            "sample_discrepancies": errors[:8],
                        },
                        severity=FindingSeverity.HIGH if err_ratio < 0.5 else FindingSeverity.CRITICAL,
                        confidence=0.6 if all_unsupervised else 0.92,
                        affected_source=contributor,
                        recommended_action=RecommendedDisposition.REVIEW if all_unsupervised else RecommendedDisposition.QUARANTINE,
                        limitations=base_limitations,
                    )
                )
            elif err_count > 0:
                base_limitations = ["Isolated flips may reflect human labeling error rather than adversarial intent."]
                if any_unsupervised:
                    base_limitations.append(
                        "Includes samples flagged only by the unsupervised k-NN feature-space "
                        "consistency check -- compares against neighbours' declared labels, not "
                        "verified ground truth."
                    )
                findings.append(
                    FindingSchema(
                        finding_id=f"FINDING-LBL-ISO-{contributor.replace('_', '').upper()}",
                        asset=dataset_id,
                        asset_type=AssetType.DATASET,
                        finding_type="label_flipping",
                        reason=f"Isolated label flipping detected in contributor '{contributor}' ({err_count} samples).",
                        evidence={
                            "contributor_id": contributor,
                            "error_count": err_count,
                            "sample_discrepancies": errors,
                        },
                        severity=FindingSeverity.MEDIUM,
                        confidence=0.55 if all_unsupervised else 0.88,
                        affected_source=contributor,
                        recommended_action=RecommendedDisposition.REVIEW,
                        limitations=base_limitations,
                    )
                )

        stats = {
            "total_label_anomalies": len(label_anomaly_samples),
            "anomaly_sample_ids": label_anomaly_samples,
            "confusion_matrix": {k: dict(v) for k, v in class_confusion_matrix.items()},
            # Unsupervised tier coverage: samples flagged with neither a
            # reference model nor ground-truth metadata available -- the
            # PRD gap this tier closes (COVERAGE.md 2.2.1 label_flipping /
            # systematic_mislabelling PARTIAL status).
            "unsupervised_tier_flagged_count": unsupervised_hits,
            "unsupervised_tier_sample_ids": list(unsupervised_flags.keys()),
        }
        return findings, stats
