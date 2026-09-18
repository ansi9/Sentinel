from typing import List, Optional
from fastapi import APIRouter, Body
from ..federated.schemas import FederatedSimulationResult
from ..federated.simulation import run_federated_training

router = APIRouter(prefix="/api/federated", tags=["Federated Learning (Multi-Branch)"])


@router.post("/simulate", response_model=FederatedSimulationResult)
async def simulate_federated_round(
    branch_ids: List[str] = Body(default=["army", "navy"], description="Participating branches, e.g. army/navy/airforce."),
    num_rounds: int = Body(default=5, ge=1, le=50),
    malicious_branch_ids: Optional[List[str]] = Body(
        default=None,
        description="Demo/test only: branch IDs (must be a subset of branch_ids) that submit a "
        "poisoned, gradient-scaled update every round, to demonstrate the aggregator's robust "
        "screening excluding them rather than letting them hijack the shared global model.",
    ),
):
    return run_federated_training(
        branch_ids=branch_ids,
        num_rounds=num_rounds,
        malicious_branch_ids=malicious_branch_ids,
    )
