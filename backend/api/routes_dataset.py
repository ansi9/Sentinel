import os
import uuid
import zipfile
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from ..audit.audit_log import shared_ledger
from ..data_assurance.contributor_risk import ContributorRiskEngine
from ..data_assurance.duplicate_detector import DuplicateDetector
from ..data_assurance.label_analyzer import LabelAnalyzer
from ..data_assurance.ood_detector import OODDetector
from ..data_assurance.poisoning_detector import PoisoningDetector
from ..ingestion.dataset_loader import DatasetLoader, SampleItem
from ..ingestion.upload_store import UPLOAD_ROOT, save_upload
from ..inference.inference_engine import InferenceEngine
from ..persistence import db
from ..schemas import DatasetProfile, InferenceConfig
from ..scenarios.probe_builder import build_visual_predictions
from .path_safety import resolve_safe_path

router = APIRouter(prefix="/api/dataset", tags=["Dataset Assurance"])
dup_detector = DuplicateDetector()
label_analyzer = LabelAnalyzer()
ood_detector = OODDetector()
poison_detector = PoisoningDetector()
contrib_engine = ContributorRiskEngine()
inference_engine = InferenceEngine()

MAX_VISUAL_CHECK_SAMPLES = 300


@router.post("/upload")
async def upload_dataset_archive(file: UploadFile = File(...)):
    """Accepts a real zip archive containing either a COCO annotations JSON
    (with an images/ folder alongside it) or a YOLO images/ + labels/
    folder pair, extracts it to disk, and returns the paths to hand to
    /analyze-profile. No sample is fabricated -- whatever is in the archive
    is exactly what gets analyzed."""
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=422, detail="Only .zip dataset archives are accepted.")

    try:
        saved_path, size_bytes = await save_upload(file, "dataset_archives")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))

    extract_dir = os.path.join(UPLOAD_ROOT, "datasets", uuid.uuid4().hex)
    os.makedirs(extract_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(saved_path) as zf:
            for member in zf.namelist():
                if member.startswith("/") or ".." in member.split("/"):
                    raise HTTPException(status_code=422, detail=f"Unsafe path in archive: {member}")
            zf.extractall(extract_dir)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid zip archive.")

    coco_candidates = [
        os.path.join(root, f)
        for root, _, files in os.walk(extract_dir)
        for f in files
        if f.lower().endswith(".json")
    ]
    yolo_candidate = None
    for root, dirs, _ in os.walk(extract_dir):
        if "images" in dirs and "labels" in dirs:
            yolo_candidate = root
            break

    # DatasetLoader.load_coco defaults images_dir to the JSON's own
    # directory, NOT a sibling "images/" folder -- but this endpoint's own
    # contract (see docstring above) is a COCO JSON "with an images/
    # folder alongside it", which is also the layout every image-quality,
    # OOD, duplicate-hash, and poisoning-trigger detector needs real
    # pixels for. Without this, that entire documented archive layout
    # silently degrades every pixel-based check to its no-image fallback.
    # Detect the sibling folder here so the caller can pass it straight
    # through to /analyze-profile's images_dir instead of guessing.
    coco_images_dir = None
    if coco_candidates:
        sibling_images = os.path.join(os.path.dirname(coco_candidates[0]), "images")
        if os.path.isdir(sibling_images):
            coco_images_dir = sibling_images

    import hashlib
    with open(saved_path, "rb") as f:
        archive_digest = hashlib.sha256(f.read()).hexdigest()
    shared_ledger.record_event(
        "DATASET_UPLOAD", extract_dir, "EXTRACT_ARCHIVE", archive_digest,
        "COMPLETED", f"Uploaded '{file.filename}' ({size_bytes} bytes); {len(coco_candidates)} COCO candidate(s), YOLO dir: {yolo_candidate or 'none'}."
    )
    return {
        "extracted_to": extract_dir,
        "coco_json_candidates": coco_candidates,
        "coco_images_dir": coco_images_dir,
        "yolo_dir_candidate": yolo_candidate,
        "size_bytes": size_bytes,
    }


@router.post("/analyze-profile")
async def analyze_dataset_profile(
    dataset_id: str = Body(default="dataset_01"),
    format_type: str = Body(default="COCO", description="'COCO' or 'YOLO'"),
    coco_path: Optional[str] = Body(default=None, description="Server-local path to a COCO-format annotations JSON file."),
    images_dir: Optional[str] = Body(default=None, description="Directory containing the images referenced by coco_path (defaults to the JSON's own directory)."),
    yolo_dir: Optional[str] = Body(default=None, description="Server-local directory containing YOLO images/ and labels/ subfolders."),
    class_names: Optional[List[str]] = Body(default=None),
    reference_model_path: Optional[str] = Body(
        default=None,
        description="Optional path to a trusted reference model. When supplied, mislabelling/label-flip "
        "detection is derived from actually running this model over every sample and comparing its real "
        "prediction to the declared label, instead of trusting metadata alone.",
    ),
):
    """Runs the full dataset-integrity pipeline against a real, caller-supplied
    COCO or YOLO dataset already staged on the server's filesystem (the
    normal ingestion pattern for an air-gapped deployment). There is no
    synthetic-sample fallback: an invalid or missing path is a 404/422, not
    a silently fabricated dataset."""
    if format_type.upper() == "COCO":
        if not coco_path:
            raise HTTPException(status_code=422, detail="coco_path is required when format_type='COCO'.")
        coco_path = resolve_safe_path(coco_path, "coco_path")
        if images_dir:
            images_dir = resolve_safe_path(images_dir, "images_dir")
        if not os.path.exists(coco_path):
            raise HTTPException(status_code=404, detail=f"coco_path not found: {coco_path}")
        samples: List[SampleItem] = DatasetLoader.load_coco(coco_path, images_dir)
    elif format_type.upper() == "YOLO":
        if not yolo_dir:
            raise HTTPException(status_code=422, detail="yolo_dir is required when format_type='YOLO'.")
        yolo_dir = resolve_safe_path(yolo_dir, "yolo_dir")
        if not os.path.isdir(yolo_dir):
            raise HTTPException(status_code=404, detail=f"yolo_dir not found: {yolo_dir}")
        samples = DatasetLoader.load_yolo(yolo_dir, class_names)
    else:
        raise HTTPException(status_code=422, detail="format_type must be 'COCO' or 'YOLO'.")

    is_valid, structure_errors = DatasetLoader.validate_dataset_structure(samples)
    if not samples:
        raise HTTPException(status_code=422, detail="Dataset contains zero valid samples.")

    shared_ledger.record_event(
        "DATASET_INGESTION", dataset_id, "INGEST_VALIDATE", samples[0].sha256[:16],
        "SUCCESS" if is_valid else "STRUCTURE_WARNINGS", f"{len(samples)} samples parsed ({format_type.upper()})."
    )

    visual_predictions_used = False
    visual_check_truncated = False
    label_kwargs: Dict[str, Any] = {}
    if reference_model_path:
        reference_model_path = resolve_safe_path(reference_model_path, "reference_model_path")
        if not os.path.exists(reference_model_path):
            raise HTTPException(status_code=404, detail=f"reference_model_path not found: {reference_model_path}")
        check_samples = samples
        if len(samples) > MAX_VISUAL_CHECK_SAMPLES:
            check_samples = samples[:MAX_VISUAL_CHECK_SAMPLES]
            visual_check_truncated = True
        visual_predictions = build_visual_predictions(
            inference_engine, reference_model_path, check_samples, InferenceConfig(confidence_threshold=0.25)
        )
        label_kwargs["visual_predictions"] = visual_predictions
        visual_predictions_used = True

    d_finds, d_stats = dup_detector.analyze(samples, dataset_id)
    l_finds, l_stats = label_analyzer.analyze(samples, dataset_id, **label_kwargs)
    o_finds, o_stats = ood_detector.analyze(samples, dataset_id)
    p_finds, p_stats = poison_detector.analyze(samples, dataset_id)

    contrib_risks = contrib_engine.aggregate_risk(samples, d_stats, l_stats, o_stats, p_stats)

    classes = class_names or sorted({label for s in samples for label in s.labels})
    class_dist: Dict[str, int] = {}
    for s in samples:
        for l in s.labels:
            class_dist[l] = class_dist.get(l, 0) + 1

    contributors = sorted({s.contributor_id for s in samples})
    batches = sorted({s.batch_id for s in samples})

    profile = DatasetProfile(
        dataset_id=dataset_id,
        format=format_type.upper(),
        total_images=len(samples),
        total_annotations=sum(len(s.labels) for s in samples),
        classes=classes,
        class_distribution=class_dist,
        contributors=contributors,
        batches=batches,
        duplicate_clusters_count=d_stats["total_duplicate_clusters"],
        label_anomaly_count=l_stats["total_label_anomalies"],
        ood_sample_count=o_stats["total_ood_samples"],
        trigger_anomaly_count=p_stats["total_trigger_samples"],
        contributor_risks=contrib_risks,
    )

    all_findings = d_finds + l_finds + o_finds + p_finds
    shared_ledger.record_event(
        "DATA_ASSURANCE", dataset_id, "ANALYZE_INTEGRITY", samples[0].sha256[:16],
        "FLAGGED" if all_findings else "PASSED_ZERO_ANOMALIES",
        f"{len(samples)} samples ({format_type.upper()}), label_verification={'real_reference_model_inference' if visual_predictions_used else 'metadata_only'}, {len(all_findings)} finding(s)."
    )

    analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
    label_verification_method = "real_reference_model_inference" if visual_predictions_used else "metadata_declared_ground_truth_only"
    db.insert_dataset_analysis(
        analysis_id=analysis_id,
        dataset_id=dataset_id,
        format_type=format_type.upper(),
        total_images=len(samples),
        findings=[f.model_dump() for f in all_findings],
        profile=profile.model_dump(),
        label_verification_method=label_verification_method,
    )

    # A small sample of real, resolvable image paths from this ingested
    # dataset -- exists purely so a caller that also uploaded a model can
    # immediately run model-side execution checks (behaviour battery,
    # backdoor probing, trigger reconstruction) against real images without
    # a second round-trip to re-discover where the dataset landed on disk.
    probe_sample_image_paths = [s.image_path for s in samples[:8] if os.path.exists(s.image_path)]

    return {
        "analysis_id": analysis_id,
        "profile": profile,
        "findings": all_findings,
        "duplicate_stats": d_stats,
        "label_stats": l_stats,
        "ood_stats": o_stats,
        "poison_stats": p_stats,
        "structure_warnings": structure_errors,
        "label_verification_method": label_verification_method,
        "visual_check_truncated_to": MAX_VISUAL_CHECK_SAMPLES if visual_check_truncated else None,
        "probe_sample_image_paths": probe_sample_image_paths,
    }


@router.get("/history")
async def list_dataset_analysis_history(limit: int = 100):
    """Real query against the persisted dataset-analyses table."""
    return {"analyses": db.list_dataset_analyses(limit=limit)}


@router.get("/history/{analysis_id}")
async def get_dataset_analysis_by_id(analysis_id: str):
    record = db.get_dataset_analysis(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No stored dataset analysis for analysis_id={analysis_id}")
    return record
