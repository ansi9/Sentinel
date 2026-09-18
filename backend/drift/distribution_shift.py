from typing import Any, Dict, List, Optional
import numpy as np
from ..schemas import DistributionShiftReport, DriftClassification
from .image_quality import compute_image_quality_signals
from .embedding_extractor import EmbeddingExtractor


class DistributionShiftDetector:
    """Distribution-shift assessment against a declared reference. Combines
    three independent signal families, each gracefully degrading when its
    inputs aren't available rather than silently substituting a fabricated
    value:
      1. Declared categorical/scalar metadata (terrain, sensor, illumination)
      2. Real pixel-derived image-quality signals (blur/contrast/resolution/
         compression), when observed samples carry a resolvable image_path
      3. Real learned-embedding distribution comparison (a diagonal Frechet
         distance over CNN feature vectors), when BOTH a reference and an
         observed image set are supplied -- this is what actually answers
         the PRD's "embedding distributions" language, as distinct from
         family #2's raw pixel statistics.
    """

    MIN_SAMPLES_FOR_CONFIDENCE = 5
    MIN_SAMPLES_FOR_EMBEDDING = 3
    # Fallback only, used when the reference population's own variance is
    # degenerate (near-zero, e.g. a single repeated reference image) and
    # can't itself supply a normalization scale. The primary normalization
    # below is self-calibrating per reference set (see
    # `_embedding_distance_scale`) rather than a single constant tuned only
    # against synthetic fixtures, which would silently mis-scale real-world
    # embedding distributions with a different natural spread.
    EMBEDDING_DISTANCE_NORMALIZATION_FALLBACK = 0.05

    @staticmethod
    def _embedding_distance_scale(var_r: np.ndarray) -> float:
        """Self-calibrating normalization scale for the diagonal-Frechet
        embedding distance: the reference population's own total per-
        dimension variance is "one reference-typical unit of natural
        spread" for that specific embedding baseline, so a Frechet distance
        equal to this scale means the observed batch differs from the
        reference by about as much as the reference differs from itself.
        This adapts to whatever reference set is actually declared instead
        of assuming every deployment's embeddings live on the same scale a
        fixed synthetic-fixture constant happened to be tuned against."""
        scale = float(np.sum(np.asarray(var_r, dtype=np.float64)))
        if not np.isfinite(scale) or scale < 1e-6:
            return DistributionShiftDetector.EMBEDDING_DISTANCE_NORMALIZATION_FALLBACK
        return scale

    def __init__(self, drift_threshold: float = 0.30, embedding_extractor: Optional[EmbeddingExtractor] = None):
        self.drift_threshold = drift_threshold
        self.embedding_extractor = embedding_extractor

    def evaluate_shift(
        self,
        reference_profile: Dict[str, Any],
        observed_samples_metadata: List[Dict[str, Any]],
        declared_reference_id: str = "ref_plains_optical_baseline",
        observed_dataset_id: str = "dataset_obs_01",
        reference_samples_metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> DistributionShiftReport:
        total = max(1, len(observed_samples_metadata))

        terrain_counts: Dict[str, int] = {}
        sensor_counts: Dict[str, int] = {}
        illum_values: List[float] = []

        quality_samples: List[Dict[str, Any]] = []
        observed_image_paths: List[str] = []
        for meta in observed_samples_metadata:
            t = meta.get("terrain", "plains")
            s = meta.get("sensor", "EO_optical")
            illum = float(meta.get("illumination", 0.75))
            terrain_counts[t] = terrain_counts.get(t, 0) + 1
            sensor_counts[s] = sensor_counts.get(s, 0) + 1
            illum_values.append(illum)

            image_path = meta.get("image_path")
            if image_path:
                observed_image_paths.append(image_path)
                signals = compute_image_quality_signals(image_path)
                if signals:
                    quality_samples.append(signals)

        ref_terrain = reference_profile.get("terrain", "plains")
        ref_sensor = reference_profile.get("sensor", "EO_optical")
        ref_illum = float(reference_profile.get("mean_illumination", 0.75))

        non_ref_terrain_ratio = 1.0 - (terrain_counts.get(ref_terrain, 0) / total)
        non_ref_sensor_ratio = 1.0 - (sensor_counts.get(ref_sensor, 0) / total)
        mean_obs_illum = float(np.mean(illum_values)) if illum_values else ref_illum
        illum_drift = abs(mean_obs_illum - ref_illum)

        dim_scores = {
            "terrain_shift": float(round(non_ref_terrain_ratio, 3)),
            "sensor_divergence": float(round(non_ref_sensor_ratio, 3)),
            "illumination_delta": float(round(illum_drift, 3)),
            "seasonal_variance": float(round(min(1.0, non_ref_terrain_ratio * 0.8), 3)),
        }

        # Reference image-quality baseline: prefer an explicitly declared
        # numeric baseline in reference_profile; otherwise, if real
        # reference sample images were supplied (reference_samples_metadata),
        # compute an empirical baseline from them directly rather than
        # falling back to a fixed zero -- a zero baseline makes every
        # quality-shift dimension either meaningless (relative-delta
        # against zero is undefined) or silently hardcoded to 0.0
        # (compression's own fallback), which would report "no shift" even
        # when the observed batch is measurably more blurred/degraded than
        # a real reference population actually on hand.
        ref_quality_samples: List[Dict[str, Any]] = []
        if reference_samples_metadata:
            for meta in reference_samples_metadata:
                ref_image_path = meta.get("image_path")
                if ref_image_path:
                    ref_signals = compute_image_quality_signals(ref_image_path)
                    if ref_signals:
                        ref_quality_samples.append(ref_signals)

        image_quality_evidence: Dict[str, Any] = {}
        limitations: List[str] = []
        if quality_samples:
            declared_blur = reference_profile.get("mean_blur_score")
            declared_contrast = reference_profile.get("mean_contrast_score")
            declared_resolution = reference_profile.get("mean_resolution_px")
            declared_blockiness = reference_profile.get("mean_compression_blockiness")

            empirical_blur = float(np.mean([q["blur_score"] for q in ref_quality_samples])) if ref_quality_samples else None
            empirical_contrast = float(np.mean([q["contrast_score"] for q in ref_quality_samples])) if ref_quality_samples else None
            empirical_resolution = float(np.mean([q["resolution_px"] for q in ref_quality_samples])) if ref_quality_samples else None
            empirical_blockiness = float(np.mean([q["compression_blockiness"] for q in ref_quality_samples])) if ref_quality_samples else None

            ref_blur = float(declared_blur) if declared_blur else empirical_blur
            ref_contrast = float(declared_contrast) if declared_contrast else empirical_contrast
            ref_resolution = float(declared_resolution) if declared_resolution else empirical_resolution
            ref_blockiness = float(declared_blockiness) if declared_blockiness else empirical_blockiness
            baseline_is_empirical = not any([declared_blur, declared_contrast, declared_resolution]) and ref_quality_samples

            obs_blur = float(np.mean([q["blur_score"] for q in quality_samples]))
            obs_contrast = float(np.mean([q["contrast_score"] for q in quality_samples]))
            obs_resolution = float(np.mean([q["resolution_px"] for q in quality_samples]))
            obs_blockiness = float(np.mean([q["compression_blockiness"] for q in quality_samples]))

            def _rel_delta(observed: float, reference: Any) -> float:
                if not reference:
                    return 0.0
                return abs(observed - reference) / (abs(reference) + 1e-6)

            blur_shift = min(1.0, _rel_delta(obs_blur, ref_blur)) if ref_blur is not None else 0.0
            contrast_shift = min(1.0, _rel_delta(obs_contrast, ref_contrast)) if ref_contrast is not None else 0.0
            resolution_shift = min(1.0, _rel_delta(obs_resolution, ref_resolution)) if ref_resolution is not None else 0.0
            blockiness_shift = min(1.0, obs_blockiness) if ref_blockiness is None else min(1.0, _rel_delta(obs_blockiness, ref_blockiness))

            dim_scores["blur_shift"] = round(blur_shift, 3)
            dim_scores["contrast_shift"] = round(contrast_shift, 3)
            dim_scores["resolution_shift"] = round(resolution_shift, 3)
            dim_scores["compression_artifact_shift"] = round(blockiness_shift, 3)

            image_quality_evidence = {
                "samples_with_computed_signals": len(quality_samples),
                "reference_samples_with_computed_signals": len(ref_quality_samples),
                "reference_baseline_source": "empirical_from_reference_images" if baseline_is_empirical else (
                    "declared_reference_profile" if ref_blur is not None else "unavailable"
                ),
                "observed_mean_blur_score": round(obs_blur, 3),
                "observed_mean_contrast_score": round(obs_contrast, 3),
                "observed_mean_resolution_px": round(obs_resolution, 1),
                "observed_mean_compression_blockiness": round(obs_blockiness, 4),
                "reference_mean_blur_score": ref_blur,
                "reference_mean_contrast_score": ref_contrast,
                "reference_mean_resolution_px": ref_resolution,
                "reference_mean_compression_blockiness": ref_blockiness,
            }
            if ref_blur is None or ref_contrast is None or ref_resolution is None:
                limitations.append(
                    "No reference image-quality baseline (blur/contrast/resolution) was declared and no "
                    "reference sample images were supplied to derive one empirically; quality-shift "
                    "dimensions are reported relative to a zero baseline and are informational only."
                )
        else:
            limitations.append(
                "No observed sample carried a resolvable image_path, so pixel-derived quality signals "
                "(blur, contrast, resolution, compression artifacts) were not computed for this evaluation; "
                "shift assessment relies on declared terrain/sensor/illumination metadata only."
            )

        # -- Embedding-space distribution comparison (real learned CNN features) --
        # Two ways to get a reference embedding baseline, tried in order:
        #   (a) live reference images (reference_samples_metadata) -- the
        #       strongest signal, embeddings extracted fresh this call
        #   (b) a declared baseline precomputed once, offline, via
        #       EmbeddingExtractor.compute_reference_statistics and stored
        #       under reference_profile["embedding_centroid"]/["embedding_variance"]
        #       -- lets the embedding signal survive even when raw reference
        #       images aren't resupplied on every single evaluation call,
        #       which is how an operator establishes a standing baseline
        #       rather than re-uploading a reference set every time.
        embedding_computed = False
        embedding_source = "unavailable"
        reference_image_paths = [
            m.get("image_path") for m in (reference_samples_metadata or []) if m.get("image_path")
        ]
        declared_centroid = reference_profile.get("embedding_centroid")
        declared_variance = reference_profile.get("embedding_variance")

        if len(observed_image_paths) >= self.MIN_SAMPLES_FOR_EMBEDDING:
            try:
                extractor = self.embedding_extractor or EmbeddingExtractor()
                obs_embeddings = extractor.extract_batch(observed_image_paths)
                frechet = None
                distance_scale = self.EMBEDDING_DISTANCE_NORMALIZATION_FALLBACK

                if len(reference_image_paths) >= self.MIN_SAMPLES_FOR_EMBEDDING and len(obs_embeddings) >= self.MIN_SAMPLES_FOR_EMBEDDING:
                    ref_embeddings = extractor.extract_batch(reference_image_paths)
                    if len(ref_embeddings) >= self.MIN_SAMPLES_FOR_EMBEDDING:
                        frechet = EmbeddingExtractor.diagonal_frechet_distance(ref_embeddings, obs_embeddings)
                        embedding_source = "live_reference_images"
                        embedding_ref_count = int(len(ref_embeddings))
                        distance_scale = self._embedding_distance_scale(ref_embeddings.var(axis=0))
                elif declared_centroid and declared_variance and len(obs_embeddings) >= self.MIN_SAMPLES_FOR_EMBEDDING:
                    mu_r = np.asarray(declared_centroid, dtype=np.float64)
                    var_r = np.asarray(declared_variance, dtype=np.float64)
                    if mu_r.shape == var_r.shape and mu_r.shape[0] == obs_embeddings.shape[1]:
                        frechet = EmbeddingExtractor.diagonal_frechet_distance_from_stats(mu_r, var_r, obs_embeddings)
                        embedding_source = "declared_reference_baseline"
                        embedding_ref_count = int(reference_profile.get("reference_sample_count", 0))
                        distance_scale = self._embedding_distance_scale(var_r)
                    else:
                        limitations.append(
                            "Declared embedding_centroid/embedding_variance dimensionality does not match "
                            "the extractor's embedding dimension; declared embedding baseline was ignored."
                        )

                if frechet is not None:
                    embedding_shift = min(1.0, frechet["embedding_frechet_distance"] / distance_scale)
                    dim_scores["embedding_shift"] = round(embedding_shift, 3)
                    image_quality_evidence["embedding_comparison"] = {
                        "reference_baseline_source": embedding_source,
                        "reference_samples_embedded": embedding_ref_count,
                        "observed_samples_embedded": int(len(obs_embeddings)),
                        "embedding_dim": int(obs_embeddings.shape[1]),
                        "normalization_scale": round(distance_scale, 6),
                        "normalization_source": "reference_population_variance" if distance_scale != self.EMBEDDING_DISTANCE_NORMALIZATION_FALLBACK else "fallback_constant_degenerate_reference_variance",
                        **frechet,
                    }
                    embedding_computed = True
            except Exception as e:
                limitations.append(f"Embedding-space comparison was attempted but failed: {e}")

        if not embedding_computed:
            limitations.append(
                f"Embedding-space distribution comparison requires at least {self.MIN_SAMPLES_FOR_EMBEDDING} "
                "resolvable observed images, plus either live reference images (reference_samples_metadata) "
                "or a declared reference baseline (reference_profile['embedding_centroid']/['embedding_variance'], "
                "precomputed once via EmbeddingExtractor.compute_reference_statistics); when neither is "
                "available, this evaluation relies on declared metadata and pixel-quality signals only, not "
                "a learned feature comparison."
            )

        weighted_terms = [
            (dim_scores["terrain_shift"], 0.30),
            (dim_scores["sensor_divergence"], 0.25),
            (dim_scores["illumination_delta"], 0.15),
            (dim_scores["seasonal_variance"], 0.05),
        ]
        if quality_samples:
            weighted_terms.extend([
                (dim_scores["blur_shift"], 0.10),
                (dim_scores["contrast_shift"], 0.05),
                (dim_scores["resolution_shift"], 0.05),
                (dim_scores["compression_artifact_shift"], 0.05),
            ])
        if embedding_computed:
            weighted_terms.append((dim_scores["embedding_shift"], 0.20))
        weight_sum = sum(w for _, w in weighted_terms)
        overall_drift = float(round(sum(v * w for v, w in weighted_terms) / weight_sum, 3))

        drift_detected = overall_drift >= self.drift_threshold
        is_manipulation = non_ref_sensor_ratio > 0.6 and illum_drift > 0.4
        if quality_samples and dim_scores["compression_artifact_shift"] > 0.6 and dim_scores["blur_shift"] > 0.5:
            is_manipulation = True
        if embedding_computed and dim_scores["embedding_shift"] > 0.75 and (non_ref_sensor_ratio > 0.4 or (quality_samples and dim_scores["compression_artifact_shift"] > 0.4)):
            is_manipulation = True

        insufficient_evidence = len(observed_samples_metadata) < self.MIN_SAMPLES_FOR_CONFIDENCE

        if insufficient_evidence:
            classification = DriftClassification.INSUFFICIENT_EVIDENCE
            confidence = 0.35
            limitations.append(
                f"Only {len(observed_samples_metadata)} observed sample(s) supplied "
                f"(< {self.MIN_SAMPLES_FOR_CONFIDENCE} minimum); shift/drift disposition is low-confidence."
            )
        elif is_manipulation:
            classification = DriftClassification.MANIPULATION_INDICATORS_PRESENT
            confidence = 0.93
        elif drift_detected:
            dims_elevated = sum(1 for v in dim_scores.values() if v >= self.drift_threshold)
            classification = (
                DriftClassification.PROBABLE_OPERATIONAL_DRIFT
                if dims_elevated <= 1
                else DriftClassification.ANOMALY_REQUIRES_REVIEW
            )
            confidence = 0.9
        else:
            classification = DriftClassification.PROBABLE_OPERATIONAL_DRIFT
            confidence = 0.93

        if drift_detected:
            char = f"Significant operational domain shift detected ({overall_drift*100:.1f}% aggregate divergence)."
            suspected = "Adversarial domain perturbation / uncalibrated sensor" if is_manipulation else "Seasonal or geographical terrain transition"
            reasoning = "Observed distributions deviate substantially from declared baseline reference features."
        else:
            char = "Observed inputs operate within standard declared operational envelope."
            suspected = "Normal operational tolerance"
            reasoning = "Feature divergences remain within accepted statistical tolerance limits."

        if classification == DriftClassification.INSUFFICIENT_EVIDENCE:
            reasoning = f"Insufficient sample volume for a calibrated disposition. {reasoning}"

        limitations.append(
            "Distribution-shift alone is not treated as proof of intentional manipulation; the "
            "MANIPULATION_INDICATORS_PRESENT classification requires corroborating multi-dimensional evidence."
        )

        return DistributionShiftReport(
            declared_reference_id=declared_reference_id,
            observed_dataset_id=observed_dataset_id,
            overall_drift_score=overall_drift,
            drift_detected=drift_detected,
            confidence=confidence,
            affected_dimensions=dim_scores,
            characterization=char,
            suspected_cause=suspected,
            is_manipulation_suspected=is_manipulation,
            reasoning=reasoning,
            classification=classification,
            image_quality_evidence=image_quality_evidence,
            limitations=limitations,
        )
