from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class BranchUpdate(BaseModel):
    """One branch's (Army/Navy/Air Force/...) locally-trained model update
    for a single federated round. Only the weight delta and a small amount
    of training metadata ever leaves the branch's own node -- raw training
    data never does, which is the whole point of federated learning for
    mutually air-gapped commands that cannot share raw imagery/sensor logs
    with each other or with a central server."""

    branch_id: str
    round_id: int
    num_samples: int
    local_loss: float
    weight_delta: List[float]
    update_hash: str
    signature: str
    public_key_hex: str
    timestamp: str


class BranchDecision(BaseModel):
    branch_id: str
    accepted: bool
    reason: str
    update_norm: float
    robust_z_score: Optional[float] = None


class FederatedRoundResult(BaseModel):
    round_id: int
    participating_branches: List[str]
    accepted_branches: List[str]
    excluded_branches: List[BranchDecision]
    global_loss_estimate: float
    global_eval_accuracy: Optional[float] = None
    aggregate_digest: str
    audit_entry_sequence_ids: List[int]


class FederatedSimulationResult(BaseModel):
    branch_ids: List[str]
    num_rounds: int
    rounds: List[FederatedRoundResult]
    final_eval_accuracy: Optional[float] = None
    branch_public_keys: Dict[str, str]
    limitations: List[str]
