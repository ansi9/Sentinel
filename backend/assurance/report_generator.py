import time
import uuid
from typing import List, Optional
from ..schemas import (
    AssuranceReport,
    AttackClassStatus,
    ContributorRiskSummary,
    CoverageItem,
    FindingSchema,
    RecommendedDisposition,
)
from .risk_engine import RiskEngine


class AssuranceReportGenerator:
    DEFAULT_COVERAGE: List[CoverageItem] = [
        CoverageItem(
            attack_class="label_flipping",
            status=AttackClassStatus.PARTIAL,
            description="Detects label discrepancies by comparing declared labels against a trusted "
            "reference model's real predictions, when one is supplied. Without a reference model, this "
            "falls back to trusting contributor-declared metadata and will not catch mislabelling on "
            "genuinely unannotated real-world data.",
            validation_method="Reference-model visual disagreement check (when reference_model_path is "
            "supplied) or declared-metadata cross-check (fallback)",
        ),
        CoverageItem(
            attack_class="systematic_mislabelling",
            status=AttackClassStatus.PARTIAL,
            description="Identifies concentrated annotation errors in specific contributor batches, subject "
            "to the same reference-model dependency as label_flipping above.",
            validation_method="Batch-level error density aggregated from per-sample label disagreement evidence",
        ),
        CoverageItem(
            attack_class="near_duplicate_flooding",
            status=AttackClassStatus.SUPPORTED,
            description="Detects redundant and flooded near-duplicate image clusters.",
            validation_method="Perceptual differential hashing (dHash) & Hamming clustering",
        ),
        CoverageItem(
            attack_class="ood_insertion",
            status=AttackClassStatus.SUPPORTED,
            description="Identifies samples deviating from baseline terrain and sensor profiles.",
            validation_method="Multivariate feature distance & Mahalanobis distribution scoring",
        ),
        CoverageItem(
            attack_class="trigger_backdoor_poisoning",
            status=AttackClassStatus.SUPPORTED,
            description="Identifies known-signature high-frequency patch watermarks in training images "
            "(spatial correlation), and detects backdoor activation by actually re-running the candidate "
            "model on clean vs. trigger-patched copies of the same image and comparing real outputs.",
            validation_method="Spatial frequency matched-filter correlation & real clean-vs-triggered "
            "inference comparison",
        ),
        CoverageItem(
            attack_class="unknown_trigger_reconstruction",
            status=AttackClassStatus.PARTIAL,
            description="Blind discovery of an unknown/never-declared trigger pattern via real "
            "gradient-based trigger inversion (Neural Cleanse, Wang et al. 2019): per candidate class, "
            "optimizes a trigger mask+pattern from scratch (never told what the real trigger looks like) "
            "and flags any class whose reconstructed trigger is anomalously small (MAD-based outlier "
            "test). Verified to correctly flag the true backdoored class and produce zero false positives "
            "on the clean model, using this system's own fixture pair. Reported PARTIAL because it "
            "requires WHITE_BOX access AND a model architecture this system can bridge into a "
            "differentiable framework (currently only this system's own detector-family ONNX graph) -- "
            "arbitrary third-party architectures report UNAVAILABLE with a reason, not a fabricated result.",
            validation_method="Neural Cleanse-style per-class trigger reconstruction + MAD anomaly-index "
            "test, executed via a real ONNX-to-PyTorch weight-transplanted differentiable model",
        ),
        CoverageItem(
            attack_class="model_substitution",
            status=AttackClassStatus.SUPPORTED,
            description="Detects replaced or bit-altered model files against a declared reference identity. "
            "Digest comparison yields one of three explicit dispositions -- MATCH, MISMATCH, or "
            "NO_REFERENCE (no trusted reference digest was ever declared for this model) -- rather than "
            "collapsing 'no reference supplied' into a false MATCH.",
            validation_method="Bitwise canonical SHA-256 digest comparison of the actual model file bytes",
        ),
        CoverageItem(
            attack_class="anomalous_model_behaviour",
            status=AttackClassStatus.SUPPORTED,
            description="Runs the same probe images through a trusted reference model and the candidate "
            "model and compares their real predictions for divergence. Weight/activation statistics "
            "additionally available for ONNX models under white-box access only.",
            validation_method="Real reference-vs-candidate inference comparison; ONNX initializer weight "
            "kurtosis/variance analysis (white-box only)",
        ),
        CoverageItem(
            attack_class="black_box_model_assessment",
            status=AttackClassStatus.PARTIAL,
            description="When only black-box access is declared, assessment is limited to input/output "
            "behavioral probing (reference battery comparison). Parameter/weight statistics and activation "
            "inspection are explicitly reported as unavailable, not approximated or faked.",
            validation_method="Input/output behavioral probing only",
        ),
        CoverageItem(
            attack_class="hash_only_model_assessment",
            status=AttackClassStatus.PARTIAL,
            description="When only HASH_ONLY access is declared (the model file's bytes are available but "
            "it is never executed or introspected), assessment is limited to file-level SHA-256 digest "
            "identity verification. All execution-dependent checks (behavioral probing, trigger response, "
            "parameter/activation analysis) are explicitly reported UNAVAILABLE with a stated reason.",
            validation_method="File-level SHA-256 digest comparison only",
        ),
        CoverageItem(
            attack_class="inference_tampering",
            status=AttackClassStatus.SUPPORTED,
            description="Detects post-hoc alteration of predictions, bounding boxes, or metadata.",
            validation_method="Cryptographic hash binding DAG & Ed25519 digital signature validation",
        ),
        CoverageItem(
            attack_class="replay_detection",
            status=AttackClassStatus.SUPPORTED,
            description="Detects replay attacks reusing historic valid inference records.",
            validation_method="Cryptographic nonces, sequence numbers, and timestamp freshness windows",
        ),
        CoverageItem(
            attack_class="reordering_detection",
            status=AttackClassStatus.SUPPORTED,
            description="Detects out-of-order/reordered inference records within a verifier's sequence "
            "stream, independent of and in addition to nonce-based replay detection.",
            validation_method="Monotonic per-stream sequence-number tracking (rejects any record whose "
            "sequence_number does not exceed the last verified sequence)",
        ),
        CoverageItem(
            attack_class="audit_log_modification",
            status=AttackClassStatus.SUPPORTED,
            description="Detects post-hoc rewriting of historical audit-ledger entries.",
            validation_method="SHA-256 hash chaining plus a per-entry Ed25519 signature, independently "
            "recomputed and verified end to end",
        ),
        CoverageItem(
            attack_class="distribution_shift",
            status=AttackClassStatus.PARTIAL,
            description="Characterizes operational domain shifts across terrain, sensor, illumination, "
            "real pixel-derived signals (blur/contrast/resolution/compression blockiness), and -- when "
            "both a reference and an observed image set are supplied -- a real embedding-space comparison: "
            "actual CNN feature vectors extracted via a real onnxruntime forward pass through a "
            "self-generated (fixed-seed, no external download) feature extractor, compared with a diagonal "
            "Frechet distance. Classifies findings into probable_operational_drift / "
            "anomaly_requires_review / manipulation_indicators_present / insufficient_evidence rather than "
            "a single manipulation flag. Reported PARTIAL because each additional signal family requires "
            "additional inputs (a declared quality baseline; a reference image set) that may not always be "
            "supplied -- when unavailable, the assessment gracefully falls back to whichever signal "
            "families it does have inputs for, and states the gap in `limitations` rather than fabricating "
            "the missing signal.",
            validation_method="Categorical divergence ratio, illumination delta, pixel-derived "
            "blur/contrast/resolution/compression-blockiness relative delta, and diagonal Frechet distance "
            "over real CNN embeddings (backend/drift/embedding_extractor.py), all vs. a declared reference",
        ),
        CoverageItem(
            attack_class="pytorch_torchscript_ingestion",
            status=AttackClassStatus.SUPPORTED,
            description="Real PyTorch/TorchScript loading via torch.jit.load / torch.load(weights_only=True) "
            "only, validated end-to-end against an actual scripted torch.nn.Module (TorchScript) and an "
            "actual state_dict checkpoint (PyTorch). weights_only=True is never retried with "
            "weights_only=False: a contributor-supplied checkpoint that fails to load under this "
            "restriction is reported as an honest BLACK_BOX load failure, never executed. Note: exotic "
            "legacy checkpoints that embed non-tensor Python objects will therefore report a load failure "
            "rather than being ingested -- this is a deliberate security boundary, not a gap.",
            validation_method="torch.jit.load / torch.load(weights_only=True), real parameter counting, "
            "tested against real compiled/saved fixtures",
        ),
    ]

    DEFAULT_ASSUMPTIONS: List[str] = [
        "System operates in a strictly air-gapped, offline environment with no external network access.",
        "Reference baseline fingerprints and declared test batteries are stored in authenticated local storage.",
        "Ingested datasets adhere to valid COCO or YOLO annotation specifications.",
    ]

    DEFAULT_LIMITATIONS: List[str] = [
        "Black-box model evaluation is limited to input/output behavioral probing (reference battery "
        "comparison); white-box weight/activation statistics are explicitly reported UNAVAILABLE rather "
        "than approximated.",
        "Backdoor/trigger detection matches against known trigger signatures (spatial frequency patch "
        "correlation, or whatever trigger pattern a caller explicitly probes for) for the primary check. "
        "Blind, gradient-based reconstruction of a never-specified trigger (Neural Cleanse) is also "
        "implemented, but only for models this system can bridge into a differentiable framework "
        "(currently its own detector-family ONNX graph) and only under WHITE_BOX access.",
        "Label-flip/mislabelling detection is only as strong as the reference model supplied for visual "
        "verification. Without one, it falls back to trusting contributor-declared metadata and will not "
        "catch errors on genuinely unannotated real-world data.",
        "PyTorch/TorchScript ingestion is validated against real scripted-module and state_dict "
        "fixtures, but ONNX remains the format exercised by the largest share of this system's test "
        "suite (backdoor/parameter analysis, behavioural batteries).",
        "Zero-day stealthy semantic triggers with extremely small perturbation norms, or a trigger style "
        "other than a spatially-local patch (Neural Cleanse's own core assumption), may still evade "
        "gradient-based reconstruction; the anomaly-index threshold was empirically calibrated against "
        "this system's own fixtures, not validated at scale against diverse real-world backdoors.",
        "Assurance evaluation provides empirical evidence and risk grading, but does not mathematically guarantee the total absence of unknown zero-day attacks.",
    ]

    def __init__(self):
        self.risk_engine = RiskEngine()

    def generate_report(
        self,
        findings: List[FindingSchema],
        contributor_summaries: List[ContributorRiskSummary],
        audit_chain_digest: str,
        audit_chain_valid: bool = True,
        dataset_status: str = "VERIFIED",
        model_status: str = "VERIFIED",
        inference_status: str = "VERIFIED",
        drift_status: str = "NORMAL",
        custom_limitations: Optional[List[str]] = None,
    ) -> AssuranceReport:
        overall_risk, assurance_score, disposition = self.risk_engine.compute_overall_risk(findings)
        report_id = f"REP-INTELX-{uuid.uuid4().hex[:8].upper()}"
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        limits = list(self.DEFAULT_LIMITATIONS)
        if custom_limitations:
            limits.extend(custom_limitations)

        return AssuranceReport(
            report_id=report_id,
            generated_at=ts,
            problem_statement_id="26228",
            organization="Ministry of Defence (MoD) / Indian Army (DGIS)",
            policy_version=self.risk_engine.POLICY_VERSION,
            overall_disposition=disposition,
            overall_risk_score=overall_risk,
            assurance_score=assurance_score,
            dataset_assurance_status=dataset_status,
            model_assurance_status=model_status,
            inference_provenance_status=inference_status,
            distribution_shift_status=drift_status,
            findings=findings,
            contributor_summaries=contributor_summaries,
            coverage_statements=self.DEFAULT_COVERAGE,
            assumptions=self.DEFAULT_ASSUMPTIONS,
            limitations=limits,
            audit_chain_digest=audit_chain_digest,
            audit_chain_valid=audit_chain_valid,
        )
