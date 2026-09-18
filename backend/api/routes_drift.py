from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body
from ..drift.distribution_shift import DistributionShiftDetector
from ..schemas import DistributionShiftReport
from .path_safety import resolve_safe_path

router = APIRouter(prefix="/api/drift", tags=["Distribution Shift"])
detector = DistributionShiftDetector()


def _sanitize_sample_image_paths(samples: List[Dict[str, Any]], description: str) -> List[Dict[str, Any]]:
    """Every sample dict may carry a real, caller-supplied `image_path`
    that the detector opens for pixel analysis (`compute_image_quality_signals`)
    -- the same "server-local path from a caller" pattern every other route
    guards with `resolve_safe_path`. Rejects anything outside the declared
    safe roots instead of silently reading whatever the caller pointed at."""
    sanitized: List[Dict[str, Any]] = []
    for sample in samples:
        image_path = sample.get("image_path")
        if image_path:
            sample = {**sample, "image_path": resolve_safe_path(image_path, description)}
        sanitized.append(sample)
    return sanitized


@router.post("/evaluate", response_model=DistributionShiftReport)
async def evaluate_distribution_shift(
    reference_profile: Optional[Dict[str, Any]] = Body(default=None),
    observed_samples: Optional[List[Dict[str, Any]]] = Body(default=None),
    reference_samples_metadata: Optional[List[Dict[str, Any]]] = Body(
        default=None,
        description="Real reference-population sample metadata (each may carry an image_path). When "
        "supplied, unlocks the empirical image-quality baseline and embedding-space (Fréchet) "
        "comparison against the observed batch -- the module's strongest shift signal. Without it, "
        "only the declared-metadata (terrain/sensor/illumination) and any observed-vs-declared "
        "quality-baseline checks are available.",
    ),
    declared_reference_id: str = Body(default="ref_plains_optical_baseline"),
    observed_dataset_id: str = Body(default="dataset_obs_01"),
):
    ref_prof = reference_profile or {
        "terrain": "plains",
        "sensor": "EO_optical",
        "mean_illumination": 0.75,
    }
    obs_samples = observed_samples or [
        {"terrain": "plains", "sensor": "EO_optical", "illumination": 0.76} for _ in range(30)
    ]
    obs_samples = _sanitize_sample_image_paths(obs_samples, "observed_samples[].image_path")
    ref_samples = (
        _sanitize_sample_image_paths(reference_samples_metadata, "reference_samples_metadata[].image_path")
        if reference_samples_metadata
        else None
    )

    return detector.evaluate_shift(
        reference_profile=ref_prof,
        observed_samples_metadata=obs_samples,
        declared_reference_id=declared_reference_id,
        observed_dataset_id=observed_dataset_id,
        reference_samples_metadata=ref_samples,
    )
