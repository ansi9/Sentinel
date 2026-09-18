import hashlib
import json
from typing import Dict, List, Tuple
import numpy as np
from cryptography.hazmat.primitives.asymmetric import ed25519
from ..audit.audit_log import TamperEvidentAuditLedger, shared_ledger
from .schemas import BranchDecision, BranchUpdate, FederatedRoundResult


class SecureFederatedAggregator:
    """Central aggregation point for a federated round across multiple
    branches (Army, Navy, Air Force, ...). Trust model: the aggregator
    trusts NO submitted update by default -- every update is (1)
    cryptographically authenticated against that branch's own enrolled
    Ed25519 public key, (2) recomputed-hash checked so the signed content
    cannot have been altered in transit, and (3) robustly screened against
    every other update in the same round before being allowed to
    contribute to the new global model. This mirrors the same "assess,
    don't assume trusted" posture the rest of IntelX uses for contributed
    datasets and models (see docs/threat_model.md) -- a federated branch
    is exactly the kind of "multi-contributor" source that document
    already treats as untrusted-until-assessed, just contributing model
    updates instead of dataset samples.

    Byzantine-robust aggregation: rather than a plain average (FedAvg),
    which a single malicious/compromised branch could arbitrarily skew by
    submitting an unbounded update, this aggregator excludes any update
    whose L2 norm is a large multiplicative outlier relative to the
    smallest update norm in the same round (a norm-ratio test, chosen over
    population statistics like MAD because a real deployment here spans a
    small number of branches -- a handful of commands, not thousands of
    edge clients -- too few samples for population statistics to be
    stable). This defends against the same gradient-scaling and model-
    replacement poisoning attacks a trimmed-mean/Krum-style defense
    targets. Only the accepted, non-outlier updates are combined via a
    sample-weighted average.
    """

    def __init__(self, outlier_ratio: float = 6.0, ledger: TamperEvidentAuditLedger = None):
        self._registered_public_keys: Dict[str, str] = {}
        self.outlier_ratio = outlier_ratio
        self.ledger = ledger if ledger is not None else shared_ledger

    def register_branch(self, branch_id: str, public_key_hex: str) -> None:
        """Enrolls a branch's public key ahead of time (out-of-band, e.g.
        during onboarding) so a later update claiming to be from
        `branch_id` must be signed by exactly this key -- an attacker
        cannot simply submit an update under someone else's branch_id with
        a key of their own choosing."""
        self._registered_public_keys[branch_id] = public_key_hex

    def _recompute_hash(self, update: BranchUpdate) -> str:
        payload = {
            "branch_id": update.branch_id,
            "round_id": update.round_id,
            "num_samples": update.num_samples,
            "local_loss": update.local_loss,
            "weight_delta": update.weight_delta,
            "timestamp": update.timestamp,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    def _verify_signature(self, update: BranchUpdate, expected_hash: str) -> bool:
        try:
            import base64

            public_key = ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(update.public_key_hex))
            sig_bytes = base64.b64decode(update.signature)
            public_key.verify(sig_bytes, expected_hash.encode("utf-8"))
            return True
        except Exception:
            return False

    def _authenticate(self, update: BranchUpdate) -> Tuple[bool, str]:
        registered_key = self._registered_public_keys.get(update.branch_id)
        if registered_key is None:
            return False, "branch_not_enrolled"
        if registered_key != update.public_key_hex:
            return False, "public_key_does_not_match_enrolled_branch_identity"

        recomputed_hash = self._recompute_hash(update)
        if recomputed_hash != update.update_hash:
            return False, "update_hash_mismatch_content_tampered_in_transit"

        if not self._verify_signature(update, recomputed_hash):
            return False, "invalid_ed25519_signature"

        return True, "authenticated"

    def aggregate_round(
        self,
        round_id: int,
        global_weights: np.ndarray,
        updates: List[BranchUpdate],
        eval_fn=None,
    ) -> Tuple[np.ndarray, FederatedRoundResult]:
        audit_sequence_ids: List[int] = []
        authenticated: List[Tuple[BranchUpdate, np.ndarray]] = []
        excluded: List[BranchDecision] = []

        for update in updates:
            ok, reason = self._authenticate(update)
            delta = np.asarray(update.weight_delta, dtype=np.float64)
            norm = float(np.linalg.norm(delta))
            if not ok:
                excluded.append(BranchDecision(branch_id=update.branch_id, accepted=False, reason=reason, update_norm=norm))
                entry = self.ledger.record_event(
                    event="FEDERATED_UPDATE_REJECTED",
                    asset_id=update.branch_id,
                    operation=f"federated_round_{round_id}",
                    input_digest=update.update_hash,
                    result=reason,
                )
                audit_sequence_ids.append(entry.sequence_id)
                continue
            authenticated.append((update, delta))

        # Robust screening over the AUTHENTICATED set only -- an
        # unauthenticated update is already rejected above regardless of
        # how "normal" its norm looks, so it can never smuggle itself in
        # by having a plausible-looking magnitude.
        #
        # A real federated deployment across a small number of branches
        # (a handful of commands, not thousands of edge clients) has too
        # few updates per round for population statistics like MAD to be
        # stable -- with only 2-3 samples, natural variation between
        # honest branches' own local data can itself look like a
        # "statistical outlier" under a MAD z-score. Instead this compares
        # every update's norm as a RATIO against the smallest (most
        # conservative) norm in the round: a gradient-scaling/model-
        # replacement attack inflates an update by a large multiplicative
        # factor, which a ratio test catches robustly regardless of cohort
        # size, while ordinary cross-branch data variation stays within a
        # generous safety margin of the smallest honest update.
        robust_accepted: List[Tuple[BranchUpdate, np.ndarray]] = []
        if len(authenticated) == 1:
            (update, delta) = authenticated[0]
            robust_accepted.append((update, delta))
            entry = self.ledger.record_event(
                event="FEDERATED_UPDATE_ACCEPTED",
                asset_id=update.branch_id,
                operation=f"federated_round_{round_id}",
                input_digest=update.update_hash,
                result="accepted_sole_participant_no_robust_screening_possible",
            )
            audit_sequence_ids.append(entry.sequence_id)
        elif authenticated:
            norms = np.array([float(np.linalg.norm(d)) for _, d in authenticated])
            floor_norm = max(float(np.min(norms)), 1e-6)

            for (update, delta), norm in zip(authenticated, norms):
                ratio = float(norm) / floor_norm
                if ratio > self.outlier_ratio:
                    excluded.append(
                        BranchDecision(
                            branch_id=update.branch_id,
                            accepted=False,
                            reason="update_norm_statistical_outlier_relative_to_this_rounds_other_branches",
                            update_norm=float(norm),
                            robust_z_score=round(ratio, 3),
                        )
                    )
                    entry = self.ledger.record_event(
                        event="FEDERATED_UPDATE_EXCLUDED_ROBUST_SCREEN",
                        asset_id=update.branch_id,
                        operation=f"federated_round_{round_id}",
                        input_digest=update.update_hash,
                        result=f"excluded_norm_ratio={round(ratio, 3)}",
                    )
                    audit_sequence_ids.append(entry.sequence_id)
                else:
                    robust_accepted.append((update, delta))
                    entry = self.ledger.record_event(
                        event="FEDERATED_UPDATE_ACCEPTED",
                        asset_id=update.branch_id,
                        operation=f"federated_round_{round_id}",
                        input_digest=update.update_hash,
                        result=f"accepted_norm_ratio={round(ratio, 3)}",
                    )
                    audit_sequence_ids.append(entry.sequence_id)

        if robust_accepted:
            total_samples = sum(u.num_samples for u, _ in robust_accepted)
            weighted_delta = sum(
                (u.num_samples / total_samples) * delta for u, delta in robust_accepted
            )
            new_global_weights = global_weights + weighted_delta
            global_loss_estimate = float(
                sum((u.num_samples / total_samples) * u.local_loss for u, _ in robust_accepted)
            )
        else:
            new_global_weights = global_weights
            global_loss_estimate = float("nan")

        accuracy = eval_fn(new_global_weights) if eval_fn is not None else None

        aggregate_digest = hashlib.sha256(
            json.dumps(
                {"round_id": round_id, "weights": [round(float(w), 8) for w in new_global_weights.tolist()]},
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()

        round_entry = self.ledger.record_event(
            event="FEDERATED_ROUND_COMPLETE",
            asset_id=f"federated_round_{round_id}",
            operation="secure_aggregation",
            input_digest=aggregate_digest,
            result=f"accepted={len(robust_accepted)},excluded={len(excluded)}",
        )
        audit_sequence_ids.append(round_entry.sequence_id)

        result = FederatedRoundResult(
            round_id=round_id,
            participating_branches=[u.branch_id for u in updates],
            accepted_branches=[u.branch_id for u, _ in robust_accepted],
            excluded_branches=excluded,
            global_loss_estimate=global_loss_estimate,
            global_eval_accuracy=accuracy,
            aggregate_digest=aggregate_digest,
            audit_entry_sequence_ids=audit_sequence_ids,
        )
        return new_global_weights, result
