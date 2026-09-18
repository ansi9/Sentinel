import hashlib
import json
import os
import time
from typing import Optional, Tuple
import numpy as np
from ..provenance.signing import ProvenanceSigner
from .schemas import BranchUpdate

DEFAULT_FEDERATED_KEYS_DIR = os.environ.get("INTELX_FEDERATED_KEYS_DIR", "keys/federated")


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


class BranchNode:
    """One participating command's local training node (e.g. Army, Navy,
    Air Force). Each branch:

    - Holds its own local dataset, which never leaves this object -- only
      a signed weight-delta update is ever produced.
    - Has its own persistent Ed25519 identity (a dedicated signing key
      under `keys/federated/<branch_id>_signing_key.pem`, distinct from
      every other branch's key and from the system's inference/audit
      keys), so the aggregator can cryptographically distinguish which
      branch an update actually came from and detect any tampering with
      an update in transit.

    Model: plain logistic regression (numpy only, no new offline
    dependency) trained by a few steps of local gradient descent per
    round -- deliberately simple so the pipeline's security properties
    (signed updates, robust aggregation, audit trail) are the point being
    demonstrated, not the model architecture.
    """

    def __init__(
        self,
        branch_id: str,
        features: np.ndarray,
        labels: np.ndarray,
        local_epochs: int = 25,
        learning_rate: float = 0.5,
        keys_dir: str = DEFAULT_FEDERATED_KEYS_DIR,
    ):
        self.branch_id = branch_id
        self.features = features
        self.labels = labels
        self.local_epochs = local_epochs
        self.learning_rate = learning_rate
        key_path = os.path.join(keys_dir, f"{branch_id}_signing_key.pem")
        registry_path = os.path.join(keys_dir, "federated_key_registry.json")
        self.signer = ProvenanceSigner(key_path=key_path, role=f"federated_{branch_id}", registry_path=registry_path)

    @property
    def public_key_hex(self) -> str:
        return self.signer.public_key_hex

    def _local_train(self, global_weights: np.ndarray) -> Tuple[np.ndarray, float]:
        """Runs local_epochs of full-batch gradient descent starting from
        the current global weights (last column is the bias term), on this
        branch's own local data only, and returns the resulting local
        weights and final training loss (binary cross-entropy)."""
        w = global_weights.copy()
        X = self.features
        y = self.labels
        n = max(1, len(y))
        X_aug = np.hstack([X, np.ones((X.shape[0], 1))])

        loss = 1.0
        for _ in range(self.local_epochs):
            z = X_aug @ w
            preds = _sigmoid(z)
            grad = X_aug.T @ (preds - y) / n
            w = w - self.learning_rate * grad
            eps = 1e-9
            loss = float(-np.mean(y * np.log(preds + eps) + (1 - y) * np.log(1 - preds + eps)))
        return w, loss

    def produce_update(self, round_id: int, global_weights: np.ndarray, malicious: bool = False) -> BranchUpdate:
        """Trains locally and returns a signed `BranchUpdate`.

        `malicious=True` is used ONLY by the test/demo harness to simulate
        a compromised or adversarial branch submitting a poisoned update
        (e.g. a data-poisoning or model-replacement attack on the
        federated round) -- it is not something a legitimate branch node
        would ever set on itself. It exists so the aggregator's robust
        screening can be verified against a real adversarial update rather
        than only against clean ones."""
        new_weights, local_loss = self._local_train(global_weights)
        delta = new_weights - global_weights

        if malicious:
            # Simulates a gradient-scaling / model-replacement attack: a
            # compromised branch submits a wildly amplified update trying
            # to drag the global model toward its own (poisoned) local
            # optimum far more aggressively than an honest FedAvg
            # contribution would.
            delta = delta * 40.0

        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        delta_list = [float(round(v, 8)) for v in delta.tolist()]
        payload = {
            "branch_id": self.branch_id,
            "round_id": round_id,
            "num_samples": int(len(self.labels)),
            "local_loss": round(local_loss, 6),
            "weight_delta": delta_list,
            "timestamp": ts,
        }
        update_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
        signature = self.signer.sign_provenance_hash(update_hash)

        return BranchUpdate(
            branch_id=self.branch_id,
            round_id=round_id,
            num_samples=int(len(self.labels)),
            local_loss=round(local_loss, 6),
            weight_delta=delta_list,
            update_hash=update_hash,
            signature=signature,
            public_key_hex=self.public_key_hex,
            timestamp=ts,
        )
