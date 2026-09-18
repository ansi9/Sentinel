import time
import uuid
from typing import Any, Dict, List
from ..assurance.report_generator import AssuranceReportGenerator
from ..audit.audit_log import TamperEvidentAuditLedger
from ..data_assurance.contributor_risk import ContributorRiskEngine
from ..drift.distribution_shift import DistributionShiftDetector
from ..inference.inference_engine import InferenceEngine
from ..model_assurance.fingerprint import ModelFingerprinter
from ..provenance.verification import ProvenanceVerifier
from ..schemas import (
    AssetType,
    FindingSchema,
    FindingSeverity,
    InferenceConfig,
    InferenceRecord,
    ModelAccessLevel,
    PreprocessingConfig,
    RecommendedDisposition,
)
from .asset_generator import AssetGenerator
from .probe_builder import PROBE_CONFIG
from .scenario_clean import ScenarioCleanDatasetRunner


class ScenarioReplayAuditRunner:
    @staticmethod
    def run_scenario_e_replay(
        fng_prt: ModelFingerprinter,
        inf_eng: InferenceEngine,
        rpt_gen: AssuranceReportGenerator,
        cnt_eng: ContributorRiskEngine,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        """Demonstrates the PRD's replay AND reordering detection path
        directly (not just prediction tampering, which Scenario D already
        covers): the same valid, signed inference record is resubmitted for
        verification a second time (nonce replay), and a stale, earlier
        record is resubmitted for verification after a newer one has
        already been processed (sequence reordering) -- both against a
        verifier configured to check replay/sequence continuity."""
        run_start = len(audit.entries)
        samples = ScenarioCleanDatasetRunner.load_dynamic_samples()
        assets = AssetGenerator.ensure_test_assets("test_assets")

        vrf = ProvenanceVerifier()
        fp = fng_prt.generate_fingerprint(assets["clean_model_path"], ModelAccessLevel.WHITE_BOX)

        # Each record's first check_replay=True verification is expected to
        # be legitimate (nonce and sequence both fresh) -- this also
        # advances vrf.last_verified_sequence, which the reordering probe
        # below needs something to be "out of order" relative to.
        preds_1 = inf_eng.run_inference(samples[0].image_path, assets["clean_model_path"], config=PROBE_CONFIG)
        record_1 = vrf.create_record(samples[0].image_path, fp.model_id, fp.sha256_digest, preds_1)
        first_valid, first_errors = vrf.verify_record(record_1, check_replay=True)
        assert first_valid, f"Expected the first legitimate verification of record_1 to pass: {first_errors}"
        audit.record_event("INFERENCE_PROVENANCE", record_1.record_id, "SIGN_BIND", record_1.provenance_hash, "CREATED_AND_VERIFIED", f"seq={record_1.sequence_number}")

        preds_2 = inf_eng.run_inference(samples[1 % len(samples)].image_path, assets["clean_model_path"], config=PROBE_CONFIG)
        record_2 = vrf.create_record(samples[1 % len(samples)].image_path, fp.model_id, fp.sha256_digest, preds_2)
        second_valid, second_errors = vrf.verify_record(record_2, check_replay=True)
        assert second_valid, f"Expected the first legitimate verification of record_2 to pass: {second_errors}"
        audit.record_event("INFERENCE_PROVENANCE", record_2.record_id, "SIGN_BIND", record_2.provenance_hash, "CREATED_AND_VERIFIED", f"seq={record_2.sequence_number}")

        # Replay attack: resubmit the exact same (already-verified) record.
        replay_valid, replay_errors = vrf.verify_record(record_1, check_replay=True)
        audit.record_event(
            "PROVENANCE_VERIFICATION", record_1.record_id, "REPLAY_PROBE", record_1.provenance_hash,
            "REPLAY_DETECTED" if not replay_valid else "UNDETECTED_ANOMALY", "; ".join(replay_errors),
        )

        # Reordering attack: after record_2 (seq=2) has been verified,
        # inject a genuinely, correctly-signed record that nonetheless
        # carries an out-of-order sequence number (seq=1, a fresh nonce, a
        # legitimately recomputed provenance hash and signature over that
        # claim) -- this isolates sequence-monotonicity detection from hash
        # tampering: the hash binding and signature are entirely valid, and
        # the record is only rejected because it is out of order.
        stale_image_path = samples[0].image_path
        stale_nonce = uuid.uuid4().hex
        stale_timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        stale_seq = 1  # deliberately not greater than record_2's sequence_number (2)
        img_hash = vrf.hasher.hash_image_file(stale_image_path)
        preproc_hash = vrf.hasher.hash_preprocessing_config(PreprocessingConfig())
        cfg_hash = vrf.hasher.hash_inference_config(InferenceConfig())
        out_hash = vrf.hasher.hash_predictions(preds_1)
        stale_image_metadata = {"path": stale_image_path, "note": "deliberately out-of-order sequence for FR-10 demo"}
        stale_metadata_hash = vrf.hasher.hash_metadata(stale_image_metadata)
        stale_prov_hash = vrf.hasher.compute_provenance_hash(
            image_hash=img_hash, model_digest=fp.sha256_digest, preprocessing_hash=preproc_hash,
            config_hash=cfg_hash, output_hash=out_hash, timestamp=stale_timestamp, nonce=stale_nonce,
            sequence_number=stale_seq, model_id=fp.model_id, metadata_hash=stale_metadata_hash,
        )
        stale_record = InferenceRecord(
            record_id=f"rec_{stale_nonce[:12]}",
            timestamp=stale_timestamp,
            nonce=stale_nonce,
            sequence_number=stale_seq,
            image_hash=img_hash,
            model_digest=fp.sha256_digest,
            preprocessing_hash=preproc_hash,
            config_hash=cfg_hash,
            output_hash=out_hash,
            provenance_hash=stale_prov_hash,
            signature=vrf.signer.sign_provenance_hash(stale_prov_hash),
            predictions=preds_1,
            image_metadata=stale_image_metadata,
            model_id=fp.model_id,
        )
        reorder_valid, reorder_errors = vrf.verify_record(stale_record, check_replay=True)
        audit.record_event(
            "PROVENANCE_VERIFICATION", stale_record.record_id, "REORDER_PROBE", stale_record.provenance_hash,
            "REORDERING_DETECTED" if not reorder_valid else "UNDETECTED_ANOMALY", "; ".join(reorder_errors),
        )

        findings: List[FindingSchema] = []
        if not replay_valid:
            findings.append(FindingSchema(
                finding_id="FINDING-INF-REPLAY-001",
                asset=record_1.record_id,
                asset_type=AssetType.INFERENCE_RECORD,
                finding_type="inference_replay",
                reason="A previously-processed, validly-signed inference record was resubmitted for "
                "verification. Nonce-reuse detection identified it as a replay.",
                evidence={"record_id": record_1.record_id, "verification_errors": replay_errors},
                severity=FindingSeverity.CRITICAL,
                confidence=1.0,
                affected_source=record_1.record_id,
                recommended_action=RecommendedDisposition.QUARANTINE,
                limitations=["Replay detection is scoped to the verifier's session-local nonce history."],
            ))
        if not reorder_valid:
            findings.append(FindingSchema(
                finding_id="FINDING-INF-REORDER-001",
                asset=stale_record.record_id,
                asset_type=AssetType.INFERENCE_RECORD,
                finding_type="inference_reordering",
                reason="An inference record carrying a sequence number lower than the last verified "
                "sequence number in this stream was submitted, indicating out-of-order or replayed delivery.",
                evidence={"record_id": stale_record.record_id, "verification_errors": reorder_errors},
                severity=FindingSeverity.HIGH,
                confidence=0.97,
                affected_source=stale_record.record_id,
                recommended_action=RecommendedDisposition.QUARANTINE,
                limitations=["Sequence continuity is tracked per verifier/session, not globally across all deployed verifiers."],
            ))

        contrib_sums = cnt_eng.aggregate_risk(samples[:20], {}, {}, {}, {})
        drift_report = DistributionShiftDetector().evaluate_shift(
            reference_profile={"terrain": "plains", "sensor": "EO_optical", "mean_illumination": 0.8},
            observed_samples_metadata=[{**s.metadata, "image_path": s.image_path} for s in samples[:20]],
            declared_reference_id="ref_plains_optical_baseline",
            observed_dataset_id="ds_clean_01",
        )

        report = rpt_gen.generate_report(
            findings=findings,
            contributor_summaries=contrib_sums,
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="VERIFIED",
            model_status="VERIFIED",
            inference_status="REPLAY_AND_REORDERING_DETECTED",
            drift_status="NORMAL",
        )

        return {
            "scenario_id": "SCENARIO-E",
            "title": "Inference Replay & Reordering Attack",
            "description": "A validly-signed inference record is resubmitted (nonce replay) and an "
            "out-of-sequence record is submitted after a newer one (reordering); both are detected via "
            "nonce history and monotonic sequence-number tracking.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "record_1": record_1,
            "record_2": record_2,
            "replay_attempt": {"record": record_1, "is_valid": replay_valid, "errors": replay_errors},
            "reorder_attempt": {"record": stale_record, "is_valid": reorder_valid, "errors": reorder_errors},
            "findings": findings,
            "drift_report": drift_report,
        }

    @staticmethod
    def run_scenario_f_audit_tamper(
        rpt_gen: AssuranceReportGenerator,
        cnt_eng: ContributorRiskEngine,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        """Demonstrates FR-15/FR-16 audit-log tamper detection as a runnable
        scenario rather than only a pytest assertion. Runs on an isolated,
        non-persisted ledger instance so the shared/live audit trail used by
        the rest of the running service is never itself corrupted by this
        demo -- only the isolated copy is tampered with and shown to fail
        verification."""
        run_start = len(audit.entries)
        demo_ledger = TamperEvidentAuditLedger(genesis_digest="INTELX_SCENARIO_F_ISOLATED_DEMO_LEDGER")

        e1 = demo_ledger.record_event("MODEL_UPLOAD", "model_demo_01", "FINGERPRINT_GENERATED", "digestA", "COMPLETED", "Baseline entry.")
        e2 = demo_ledger.record_event("MODEL_ASSESSMENT", "model_demo_01", "BEHAVIOURAL_BATTERY", "digestA", "NORMAL", "Second baseline entry.")
        e3 = demo_ledger.record_event("ASSURANCE_REPORT", "model_demo_01", "GENERATE_REPORT", "digestA", "ACCEPT", "Third baseline entry.")

        pre_tamper_valid, pre_tamper_errors = demo_ledger.verify_ledger_integrity()

        demo_ledger.entries[1].result = "ACCEPT"
        demo_ledger.entries[1].evidence_reference = "Post-hoc rewrite: erased original BEHAVIOURAL_BATTERY=NORMAL evidence."

        post_tamper_valid, post_tamper_errors = demo_ledger.verify_ledger_integrity()

        finding = FindingSchema(
            finding_id="FINDING-AUD-TAMPER-001",
            asset="audit_ledger_demo_01",
            asset_type=AssetType.PIPELINE,
            finding_type="audit_log_modification",
            reason="A post-hoc modification to a historical audit-log entry was detected: the recalculated "
            "entry hash no longer matches the stored hash, and the hash-chain link to the following entry "
            "is broken.",
            evidence={
                "tampered_sequence_id": demo_ledger.entries[1].sequence_id,
                "verification_errors": post_tamper_errors,
                "pre_tamper_chain_valid": pre_tamper_valid,
            },
            severity=FindingSeverity.CRITICAL,
            confidence=1.0,
            affected_source="audit_ledger_demo_01",
            recommended_action=RecommendedDisposition.QUARANTINE,
            limitations=["Detection relies on the hash chain and per-entry Ed25519 signature both being "
                         "available for independent recomputation; it does not itself prevent tampering."],
        )

        audit.record_event(
            "AUDIT_INTEGRITY_TEST", "audit_ledger_demo_01", "ISOLATED_TAMPER_SIMULATION", demo_ledger.current_chain_digest,
            "TAMPER_DETECTED" if not post_tamper_valid else "UNDETECTED_ANOMALY",
            f"Isolated demo ledger: pre-tamper valid={pre_tamper_valid}, post-tamper valid={post_tamper_valid}, "
            f"{len(post_tamper_errors)} violation(s) surfaced.",
        )

        report = rpt_gen.generate_report(
            findings=[finding],
            contributor_summaries=[],
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="NOT_APPLICABLE",
            model_status="NOT_APPLICABLE",
            inference_status="NOT_APPLICABLE",
            drift_status="NOT_APPLICABLE",
        )

        return {
            "scenario_id": "SCENARIO-F",
            "title": "Post-Hoc Audit-Log Modification",
            "description": "A historical entry in a tamper-evident audit ledger is rewritten after the "
            "fact; hash-chain recalculation and per-entry Ed25519 signature verification both surface the "
            "violation.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "pre_tamper_valid": pre_tamper_valid,
            "post_tamper_valid": post_tamper_valid,
            "post_tamper_errors": post_tamper_errors,
            "findings": [finding],
        }
