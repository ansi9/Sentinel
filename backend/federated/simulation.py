import zlib
from typing import Dict, List, Optional
import numpy as np
from ..audit.audit_log import TamperEvidentAuditLedger
from .aggregator import SecureFederatedAggregator
from .branch_node import BranchNode, DEFAULT_FEDERATED_KEYS_DIR, _sigmoid
from .schemas import FederatedSimulationResult

NUM_FEATURES = 4


def _stable_hash(text: str) -> int:
    """Deterministic across processes/runs, unlike Python's built-in
    `hash()` on strings, which is randomized per-process (PYTHONHASHSEED)
    by default. Using `hash()` here would make each branch's synthetic
    data distribution shift differently every time the simulation runs --
    not a security issue, but it silently breaks reproducibility of a
    demo/test run across restarts."""
    return zlib.crc32(text.encode("utf-8"))


def _synthetic_branch_dataset(branch_id: str, n_samples: int = 120, seed: int = 0):
    """Generates a labelled synthetic local dataset for one branch: two
    linearly-separable classes with a per-branch mean/covariance shift, so
    each branch's local data distribution differs slightly (representing,
    e.g., Army/Navy/Air Force operating in different terrain, sensor, or
    platform domains) the way real cross-branch operational data would,
    without using any classified, operational, or service-generated data --
    purely synthetic, matching this project's existing data-generation
    posture (see `backend/scenarios/asset_generator.py`)."""
    rng = np.random.RandomState(seed)
    branch_shift = (_stable_hash(branch_id) % 1000) / 1000.0 - 0.5

    n_pos = n_samples // 2
    n_neg = n_samples - n_pos
    pos = rng.normal(loc=1.0 + branch_shift, scale=0.6, size=(n_pos, NUM_FEATURES))
    neg = rng.normal(loc=-1.0 + branch_shift, scale=0.6, size=(n_neg, NUM_FEATURES))
    X = np.vstack([pos, neg])
    y = np.concatenate([np.ones(n_pos), np.zeros(n_neg)])
    perm = rng.permutation(len(y))
    return X[perm], y[perm]


def _synthetic_eval_set(seed: int = 999, n_samples: int = 200):
    rng = np.random.RandomState(seed)
    n_pos = n_samples // 2
    n_neg = n_samples - n_pos
    pos = rng.normal(loc=1.0, scale=0.6, size=(n_pos, NUM_FEATURES))
    neg = rng.normal(loc=-1.0, scale=0.6, size=(n_neg, NUM_FEATURES))
    X = np.vstack([pos, neg])
    y = np.concatenate([np.ones(n_pos), np.zeros(n_neg)])
    return X, y


def _accuracy(weights: np.ndarray, X: np.ndarray, y: np.ndarray) -> float:
    X_aug = np.hstack([X, np.ones((X.shape[0], 1))])
    preds = _sigmoid(X_aug @ weights) >= 0.5
    return float(np.mean(preds == y))


def run_federated_training(
    branch_ids: List[str],
    num_rounds: int = 5,
    malicious_branch_ids: Optional[List[str]] = None,
    keys_dir: str = DEFAULT_FEDERATED_KEYS_DIR,
    ledger: Optional[TamperEvidentAuditLedger] = None,
) -> FederatedSimulationResult:
    """Runs a full secure federated-learning simulation across the given
    branches (e.g. ["army", "navy"], or ["army", "navy", "airforce"]).
    Each branch keeps its own local synthetic dataset private and only ever
    contributes a signed weight-delta update per round; the aggregator
    authenticates, robustly screens, and combines those updates into one
    shared global model, recording every decision into IntelX's existing
    tamper-evident audit ledger.

    `malicious_branch_ids` simulates one or more branches submitting a
    poisoned (gradient-scaled) update every round, to demonstrate that the
    aggregator's robust screening keeps such a branch's update from
    hijacking the shared global model -- this is a test/demo harness
    parameter, not something a real branch node would set on itself."""
    malicious_branch_ids = set(malicious_branch_ids or [])
    limitations = [
        "Uses purely synthetic, locally-generated per-branch data (no classified, operational, "
        "or service-generated data), matching this project's existing data-generation posture.",
        "Model architecture is a simple logistic regression trained by local gradient descent -- "
        "chosen so the pipeline's SECURITY properties (signed updates, authenticated identity, "
        "Byzantine-robust aggregation, tamper-evident audit trail) are what this demonstrates, "
        "not a production-grade computer-vision architecture.",
        "Branches are simulated in a single process for reproducibility; a real multi-node "
        "deployment would run each BranchNode on its own air-gapped machine and transport signed "
        "BranchUpdate payloads out-of-band (removable media, a cross-domain guard, etc.) -- the "
        "authentication and robust-aggregation guarantees are unchanged by that transport, since "
        "they depend only on the signature and the update content, not on how it physically arrived.",
        "Robust aggregation defends against a single (or minority) statistically-outlying update "
        "per round; it does not defend against a coordinated majority of branches submitting "
        "colluding poisoned updates that all resemble each other.",
    ]

    branches: Dict[str, BranchNode] = {}
    for idx, branch_id in enumerate(branch_ids):
        X, y = _synthetic_branch_dataset(branch_id, seed=100 + idx)
        branches[branch_id] = BranchNode(branch_id, X, y, keys_dir=keys_dir)

    aggregator = SecureFederatedAggregator(ledger=ledger)
    for branch_id, node in branches.items():
        aggregator.register_branch(branch_id, node.public_key_hex)

    global_weights = np.zeros(NUM_FEATURES + 1)
    eval_X, eval_y = _synthetic_eval_set()

    def _eval_fn(weights: np.ndarray) -> float:
        return _accuracy(weights, eval_X, eval_y)

    round_results = []
    for round_id in range(1, num_rounds + 1):
        updates = [
            node.produce_update(round_id, global_weights, malicious=(branch_id in malicious_branch_ids))
            for branch_id, node in branches.items()
        ]
        global_weights, result = aggregator.aggregate_round(round_id, global_weights, updates, eval_fn=_eval_fn)
        round_results.append(result)

    return FederatedSimulationResult(
        branch_ids=list(branch_ids),
        num_rounds=num_rounds,
        rounds=round_results,
        final_eval_accuracy=round_results[-1].global_eval_accuracy if round_results else None,
        branch_public_keys={bid: node.public_key_hex for bid, node in branches.items()},
        limitations=limitations,
    )
