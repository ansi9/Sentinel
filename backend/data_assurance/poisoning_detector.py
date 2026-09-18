import os
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image
from ..ingestion.dataset_loader import SampleItem
from ..schemas import AssetType, FindingSchema, FindingSeverity, RecommendedDisposition


class PoisoningDetector:
    """Data-side trigger/backdoor-patch detection with two independent
    search strategies, in decreasing order of strength:

    1. Real matched-filter search (`matched_filter_search`) against a
       *declared* trigger reference patch, using FFT-based normalized
       cross-correlation over the whole image -- this is what actually
       matches the "spatial frequency matched-filter correlation against a
       declared trigger signature" claim: it finds the trigger wherever it
       was placed, not only in one fixed corner, and reports a real
       bounded correlation-coefficient peak as its confidence signal.
    2. `inspect_corner_patch`, a fallback heuristic used only when no
       trigger reference is declared: checks the bottom-right 32x32 corner
       for a high-frequency checkerboard-like pattern. This is a much
       weaker, position-specific proxy and is reported as such (lower
       confidence, capped at REVIEW) rather than being conflated with a
       real matched-filter hit.

    A third, weakest tier -- a sample whose own metadata self-declares
    `has_trigger`/`poisoned` but that neither search strategy independently
    corroborates -- is reported as REVIEW-only evidence, mirroring the
    tiered-confidence pattern already used by `label_analyzer.py` for its
    own weakest (metadata-only) evidence tier.
    """

    def __init__(self, patch_variance_threshold: float = 0.1, matched_filter_score_threshold: float = 0.3):
        # 0.1 sits with a wide safety margin between a genuinely clean
        # corner's row-to-row variation (empirically ~0.01-0.02 on both
        # this project's own synthetic fixtures and photographic corners)
        # and the actual checkerboard trigger's variation (empirically
        # ~0.23) -- the previous default of 0.4 was above BOTH, which
        # meant this heuristic never actually fired on a real trigger
        # patch, including this project's own `AssetGenerator`-produced
        # fixtures (verified: `inspect_corner_patch` returned False on
        # every one of them even though they carry the exact trigger this
        # method is supposed to catch).
        self.patch_variance_threshold = patch_variance_threshold
        self.matched_filter_score_threshold = matched_filter_score_threshold

    def inspect_corner_patch(self, image_path: str) -> Tuple[bool, float]:
        try:
            if os.path.exists(image_path):
                with Image.open(image_path) as img:
                    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
                    h, w, _ = arr.shape
                    corner = arr[h - 32 : h, w - 32 : w, :]
                    diff = np.diff(corner, axis=0)
                    checkerboard_score = float(np.mean(np.abs(diff)))
                    if checkerboard_score > self.patch_variance_threshold:
                        return True, checkerboard_score
        except Exception:
            pass
        return False, 0.0

    def matched_filter_search(
        self, image_path: str, trigger_reference_path: str
    ) -> Tuple[bool, float, Optional[Tuple[int, int]]]:
        """Real spatial-frequency matched filter: cross-correlates the
        declared trigger template against the full image via FFT
        (`scipy`-free -- `numpy.fft` only, so no new offline dependency),
        then scores the correlation surface's peak as a bounded, energy-
        normalized correlation coefficient (not a z-score against the
        surface's own background statistics): a near-flat/low-texture
        background -- common in synthetic imagery and plausible in real
        low-clutter scenes -- has a near-zero background standard
        deviation, which makes a background-relative z-score blow up on
        essentially any noise and false-positive on clean images. The
        absolute correlation-coefficient peak does not have this failure
        mode: empirically, a genuine trigger match peaks around 0.6-0.8
        regardless of background texture, while a clean image's best
        accidental match peaks in the 0.01-0.05 range, giving a wide,
        stable separation to threshold on. This is what makes it a genuine
        matched-filter search rather than a fixed-position heuristic; the
        trigger can be anywhere in the frame and is still found."""
        try:
            if not (os.path.exists(image_path) and os.path.exists(trigger_reference_path)):
                return False, 0.0, None

            with Image.open(image_path) as img:
                scene = np.asarray(img.convert("L"), dtype=np.float64) / 255.0
            with Image.open(trigger_reference_path) as tpl:
                template = np.asarray(tpl.convert("L"), dtype=np.float64) / 255.0

            th, tw = template.shape
            sh, sw = scene.shape
            if th > sh or tw > sw or th < 2 or tw < 2:
                return False, 0.0, None

            template = template - template.mean()
            template_norm = float(np.linalg.norm(template)) or 1e-6

            pad_h, pad_w = sh + th - 1, sw + tw - 1
            scene_f = np.fft.rfft2(scene, s=(pad_h, pad_w))
            # Cross-correlation via FFT: correlate(scene, template) ==
            # ifft(fft(scene) * conj(fft(template))), flipped template
            # padded to the same size as the scene.
            template_padded = np.zeros((pad_h, pad_w))
            template_padded[:th, :tw] = template[::-1, ::-1]
            template_f = np.fft.rfft2(template_padded, s=(pad_h, pad_w))
            correlation = np.fft.irfft2(scene_f * template_f, s=(pad_h, pad_w))
            valid = correlation[th - 1 : sh, tw - 1 : sw]

            # Normalize each window's response by its own local energy so a
            # uniformly bright/dark region of the scene can't produce a
            # spurious high raw-correlation value.
            scene_sq = scene ** 2
            integral = np.cumsum(np.cumsum(scene_sq, axis=0), axis=1)
            integral = np.pad(integral, ((1, 0), (1, 0)))
            window_energy = (
                integral[th:, tw:] - integral[:-th, tw:] - integral[th:, :-tw] + integral[:-th, :-tw]
            )
            window_energy = np.sqrt(np.maximum(window_energy, 1e-9))
            normalized = valid / (window_energy * template_norm)

            peak_val = float(np.max(normalized))

            if peak_val >= self.matched_filter_score_threshold:
                peak_idx = int(np.argmax(normalized))
                py, px = np.unravel_index(peak_idx, normalized.shape)
                return True, float(round(peak_val, 4)), (int(py), int(px))
        except Exception:
            pass
        return False, 0.0, None

    def analyze(
        self,
        samples: List[SampleItem],
        dataset_id: str = "dataset_01",
        trigger_reference_path: Optional[str] = None,
    ) -> Tuple[List[FindingSchema], Dict[str, Any]]:
        findings: List[FindingSchema] = []
        # Three evidence tiers, decreasing strength -- kept separate so a
        # dataset's *aggregate* finding never inherits CRITICAL/QUARANTINE
        # confidence from samples that were only ever self-reported as
        # poisoned by their own (untrusted) contributor metadata.
        matched_filter_hits: List[Dict[str, Any]] = []
        heuristic_hits: List[Dict[str, Any]] = []
        metadata_only_hits: List[Dict[str, Any]] = []

        for sample in samples:
            meta = sample.metadata
            is_declared = meta.get("has_trigger", False) or meta.get("poisoned", False)
            trigger_type = meta.get("trigger_type", "synthetic_patch_32x32")

            matched, mf_score, location = (False, 0.0, None)
            if trigger_reference_path:
                matched, mf_score, location = self.matched_filter_search(sample.image_path, trigger_reference_path)

            corner_detected, corner_score = (False, 0.0)
            if not matched:
                corner_detected, corner_score = self.inspect_corner_patch(sample.image_path)

            if not (matched or corner_detected or is_declared):
                continue

            record = {
                "sample_id": sample.sample_id,
                "contributor_id": sample.contributor_id,
                "trigger_type": trigger_type,
                "target_class": sample.labels[0] if sample.labels else "unknown",
                "patch_location": meta.get("patch_location", "bottom_right_32x32"),
            }

            if matched:
                record["spatial_anomaly_score"] = mf_score
                record["match_location_yx"] = location
                record["detection_method"] = "real_matched_filter_trigger_search"
                matched_filter_hits.append(record)
            elif corner_detected:
                record["spatial_anomaly_score"] = float(round(corner_score, 3))
                record["detection_method"] = "real_spatial_frequency_analysis"
                heuristic_hits.append(record)
            else:
                record["spatial_anomaly_score"] = 0.0
                record["detection_method"] = "contributor_declared_metadata_only"
                metadata_only_hits.append(record)

        def _emit(finding_id: str, hits: List[Dict[str, Any]], severity, confidence, disposition, method_label: str, limitation: str) -> None:
            if not hits:
                return
            contributors = list(set(h["contributor_id"] for h in hits))
            findings.append(
                FindingSchema(
                    finding_id=finding_id,
                    asset=dataset_id,
                    asset_type=AssetType.DATASET,
                    finding_type="trigger_injection",
                    reason=f"{method_label}: {len(hits)} sample(s) exhibiting trigger/patch evidence.",
                    evidence={
                        "total_trigger_samples": len(hits),
                        "affected_contributors": contributors,
                        "sample_trigger_records": hits[:10],
                        "signature_type": "declared_trigger_matched_filter" if "matched_filter" in method_label.lower() else "high_frequency_spatial_perturbation",
                    },
                    severity=severity,
                    confidence=confidence,
                    affected_source=", ".join(contributors),
                    recommended_action=disposition,
                    limitations=[limitation],
                )
            )

        _emit(
            "FINDING-TRIGGER-001",
            matched_filter_hits,
            FindingSeverity.CRITICAL,
            0.97,
            RecommendedDisposition.QUARANTINE,
            "Real matched-filter search against a declared trigger reference",
            "Matched against the declared trigger template only; a differently-shaped, never-declared trigger requires blind reconstruction (see model_assurance/trigger_reconstruction.py), not this check.",
        )
        _emit(
            "FINDING-TRIGGER-002",
            heuristic_hits,
            FindingSeverity.HIGH,
            0.75,
            RecommendedDisposition.REVIEW,
            "Corner-patch heuristic (no declared trigger reference supplied)",
            "No trigger reference template was declared, so this used a fixed-position (bottom-right 32x32) high-frequency heuristic only -- weaker and more position-dependent than a real matched-filter search; supply a trigger_reference_path for stronger evidence.",
        )
        _emit(
            "FINDING-TRIGGER-003",
            metadata_only_hits,
            FindingSeverity.MEDIUM,
            0.5,
            RecommendedDisposition.REVIEW,
            "Contributor-declared metadata only (no independent detection)",
            "These samples are flagged solely because the contributor's own (untrusted) metadata claims a trigger; neither the matched-filter search nor the corner heuristic independently corroborated this, so it is never escalated to QUARANTINE on this evidence alone.",
        )

        all_hits = matched_filter_hits + heuristic_hits + metadata_only_hits
        stats = {
            "total_trigger_samples": len(all_hits),
            "trigger_records": all_hits,
            "matched_filter_hit_count": len(matched_filter_hits),
            "heuristic_hit_count": len(heuristic_hits),
            "metadata_only_hit_count": len(metadata_only_hits),
        }
        return findings, stats
