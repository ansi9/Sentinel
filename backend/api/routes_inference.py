import json
import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from ..audit.audit_log import shared_ledger
from ..inference.inference_engine import InferenceEngine, ModelExecutionError
from ..ingestion.model_loader import ModelLoader
from ..ingestion.upload_store import save_upload
from ..persistence import db
from ..provenance.verification import ProvenanceVerifier
from ..schemas import BoundingBox, InferenceConfig, InferenceRecord, PreprocessingConfig
from .path_safety import resolve_safe_path

router = APIRouter(prefix="/api/inference", tags=["Inference & Provenance"])
engine = InferenceEngine()
verifier = ProvenanceVerifier()


@router.post("/upload-image")
async def upload_probe_image(file: UploadFile = File(...)):
    try:
        saved_path, size_bytes = await save_upload(file, "images")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    return {"image_path": saved_path, "size_bytes": size_bytes}


@router.post("/execute", response_model=InferenceRecord)
async def execute_inference(
    image_path: str = Body(...),
    model_path: str = Body(...),
    preprocessing: Optional[PreprocessingConfig] = Body(default=None),
    config: Optional[InferenceConfig] = Body(default=None),
):
    """Actually runs the supplied model against the supplied image via
    onnxruntime and cryptographically binds the real predictions -- the
    model digest used in the provenance record is computed from the model
    file itself, not accepted as a client-supplied claim."""
    image_path = resolve_safe_path(image_path, "image_path")
    model_path = resolve_safe_path(model_path, "model_path")
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail=f"Model not found: {model_path}")

    model_digest = ModelLoader.calculate_file_sha256(model_path)
    model_id = f"model_{model_digest[:12]}"

    try:
        predictions = engine.run_inference(image_path, model_path, preprocessing, config)
    except ModelExecutionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    record = verifier.create_record(
        image_path=image_path,
        model_id=model_id,
        model_digest=model_digest,
        predictions=predictions,
        preproc=preprocessing,
        config=config,
    )

    db.insert_inference_record(record.model_dump())

    shared_ledger.record_event(
        "INFERENCE_PROVENANCE", record.record_id, "SIGN_BIND", record.provenance_hash,
        "CREATED", f"Image={os.path.basename(image_path)}, model={model_id}, {len(predictions)} detection(s), signature={record.signature[:16]}..."
    )
    return record


@router.get("/list")
async def list_inference_records(limit: int = 100):
    """Real query against the persisted inference-records table."""
    return {"records": db.list_inference_records(limit=limit)}


@router.get("/record/{record_id}")
async def get_inference_record_by_id(record_id: str):
    record = db.get_inference_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No stored inference record for record_id={record_id}")
    return record


@router.post("/record/{record_id}/verify")
async def verify_stored_record(record_id: str, check_replay: bool = False):
    """Verifies a previously-created record by pulling the authoritative
    copy back out of the database by its ID, instead of requiring the
    caller to already hold and resend the full record JSON."""
    stored = db.get_inference_record(record_id)
    if not stored:
        raise HTTPException(status_code=404, detail=f"No stored inference record for record_id={record_id}")

    record = InferenceRecord.model_validate(json.loads(stored["record_json"]))
    is_valid, errors = verifier.verify_record(record, check_replay=check_replay)

    shared_ledger.record_event(
        "PROVENANCE_VERIFICATION", record.record_id, "VERIFY_INTEGRITY_FROM_DB", record.provenance_hash,
        "VALID" if is_valid else "TAMPERING_DETECTED", "; ".join(errors) if errors else "Cryptographic binding verified."
    )
    return {
        "record_id": record.record_id,
        "is_valid": is_valid,
        "tampering_detected": not is_valid,
        "errors": errors,
        "provenance_hash": record.provenance_hash,
        "signature_valid": is_valid,
    }


@router.post("/verify")
async def verify_record(record: InferenceRecord, check_replay: bool = False):
    is_valid, errors = verifier.verify_record(record, check_replay=check_replay)

    shared_ledger.record_event(
        "PROVENANCE_VERIFICATION", record.record_id, "VERIFY_INTEGRITY", record.provenance_hash,
        "VALID" if is_valid else "TAMPERING_DETECTED", "; ".join(errors) if errors else "Cryptographic binding verified."
    )
    return {
        "record_id": record.record_id,
        "is_valid": is_valid,
        "tampering_detected": not is_valid,
        "errors": errors,
        "provenance_hash": record.provenance_hash,
        "signature_valid": is_valid,
    }


@router.post("/tamper-simulate")
async def simulate_tamper(
    record: InferenceRecord,
    modified_class: str = "civilian_bus",
    modified_confidence: float = 0.99,
):
    tampered_record = record.model_copy(deep=True)
    if tampered_record.predictions:
        tampered_record.predictions[0].class_name = modified_class
        tampered_record.predictions[0].confidence = modified_confidence
    else:
        tampered_record.predictions.append(
            BoundingBox(class_name=modified_class, confidence=modified_confidence, box=[100, 100, 200, 200])
        )

    is_valid, errors = verifier.verify_record(tampered_record)
    tampered_record.is_valid = is_valid
    tampered_record.tampering_detected = not is_valid
    tampered_record.verification_errors = errors

    shared_ledger.record_event(
        "PROVENANCE_VERIFICATION", tampered_record.record_id, "TAMPER_SIMULATION", tampered_record.provenance_hash,
        "TAMPERING_DETECTED" if not is_valid else "UNDETECTED_ANOMALY", "; ".join(errors) if errors else "no verification errors"
    )
    return {
        "original_provenance_hash": record.provenance_hash,
        "tampered_record": tampered_record,
        "is_valid": is_valid,
        "tampering_detected": not is_valid,
        "verification_errors": errors,
    }
