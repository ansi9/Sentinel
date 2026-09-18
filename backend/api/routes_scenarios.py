from fastapi import APIRouter, HTTPException
from ..persistence import db
from ..scenarios.scenario_manager import ScenarioManager

router = APIRouter(prefix="/api/scenarios", tags=["Scenarios"])
manager = ScenarioManager()


@router.get("/list")
async def list_scenarios():
    return [
        {
            "id": "A",
            "name": "Scenario A — Clean Operational Pipeline",
            "badge": "LOW RISK",
            "disposition": "ACCEPT",
            "description": "Baseline COCO/YOLO dataset with trusted contributors, authentic model, and cryptographically verified inference records.",
        },
        {
            "id": "B",
            "name": "Scenario B — Compromised Dataset & Malicious Source",
            "badge": "HIGH RISK",
            "disposition": "QUARANTINE",
            "description": "Contributor Bravo flooding duplicate clusters, high-frequency trigger watermarks, and inverted classification labels.",
        },
        {
            "id": "C",
            "name": "Scenario C — Substituted & Backdoored Model",
            "badge": "CRITICAL RISK",
            "disposition": "QUARANTINE",
            "description": "Supplied vision model with substituted SHA-256 weight digest and anomalous behavior on trigger test battery.",
        },
        {
            "id": "D",
            "name": "Scenario D — Post-Hoc Inference Record Tampering",
            "badge": "TAMPERING DETECTED",
            "disposition": "QUARANTINE",
            "description": "Cryptographically protected inference record altered post-execution; DAG hash recalculation detects corruption.",
        },
        {
            "id": "E",
            "name": "Scenario E — Inference Replay & Reordering Attack",
            "badge": "REPLAY DETECTED",
            "disposition": "QUARANTINE",
            "description": "A validly-signed inference record is resubmitted (nonce replay) and an out-of-sequence record is injected after a newer one (reordering); both are caught by nonce history and sequence-monotonicity checks.",
        },
        {
            "id": "F",
            "name": "Scenario F — Post-Hoc Audit-Log Modification",
            "badge": "AUDIT TAMPER DETECTED",
            "disposition": "QUARANTINE",
            "description": "A historical audit-ledger entry is rewritten after the fact; hash-chain recalculation and per-entry Ed25519 signature verification both surface the violation.",
        },
    ]


@router.post("/run/{scenario_id}")
async def run_scenario(scenario_id: str):
    sid = scenario_id.upper()
    if sid == "A":
        result = manager.run_scenario_a_clean()
    elif sid == "B":
        result = manager.run_scenario_b_poisoned()
    elif sid == "C":
        result = manager.run_scenario_c_model_compromised()
    elif sid == "D":
        result = manager.run_scenario_d_tampered_inference()
    elif sid == "E":
        result = manager.run_scenario_e_replay()
    elif sid == "F":
        result = manager.run_scenario_f_audit_tamper()
    else:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found. Available: A, B, C, D, E, F")

    db.insert_assurance_report(result["report"].model_dump())
    return result
