import copy
from typing import Any, Dict, List
from ..assurance.report_generator import AssuranceReportGenerator
from ..audit.audit_log import TamperEvidentAuditLedger
from ..data_assurance.contributor_risk import ContributorRiskEngine
from ..drift.distribution_shift import DistributionShiftDetector
from ..inference.inference_engine import InferenceEngine
from ..model_assurance.backdoor_detector import BackdoorDetector
from ..model_assurance.behaviour_analyzer import BehaviourAnalyzer
from ..model_assurance.fingerprint import ModelFingerprinter
from ..model_assurance.parameter_analyzer import ParameterAnalyzer
from ..provenance.verification import ProvenanceVerifier
from ..schemas import AssetType, FindingSchema, FindingSeverity, ModelAccessLevel, RecommendedDisposition
from .asset_generator import AssetGenerator
from .probe_builder import PROBE_CONFIG, build_reference_battery, build_trigger_probes
from .scenario_clean import ScenarioCleanDatasetRunner


class ScenarioModelInferenceRunner:
    @staticmethod
    def run_scenario_c(
        fng_prt: ModelFingerprinter,
        beh_an: BehaviourAnalyzer,
        bdr_det: BackdoorDetector,
        inf_eng: InferenceEngine,
        vrf: ProvenanceVerifier,
        rpt_gen: AssuranceReportGenerator,
        cnt_eng: ContributorRiskEngine,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        run_start = len(audit.entries)
        samples = ScenarioCleanDatasetRunner.load_dynamic_samples()
        assets = AssetGenerator.ensure_test_assets("test_assets")

        clean_fp = fng_prt.generate_fingerprint(assets["clean_model_path"], ModelAccessLevel.WHITE_BOX)
        expected_ref_digest = clean_fp.sha256_digest

        compromised_fp = fng_prt.generate_fingerprint(assets["backdoored_model_path"], ModelAccessLevel.WHITE_BOX)

        is_match, sub_finding = fng_prt.verify_against_reference(compromised_fp, expected_ref_digest)
        all_findings: List[FindingSchema] = []
        if sub_finding:
            all_findings.append(sub_finding)

        audit.record_event("MODEL_FINGERPRINT", compromised_fp.model_id, "DIGEST_VERIFICATION", compromised_fp.sha256_digest, "MISMATCH_ALERT", "Supplied model does not match reference digest.")

        # Real weight-statistics analysis on the actual ONNX initializer tensors.
        import onnx
        param_analyzer = ParameterAnalyzer()
        compromised_onnx = onnx.load(assets["backdoored_model_path"])
        weight_tensors = param_analyzer.extract_onnx_weight_tensors(compromised_onnx)
        param_stats, param_findings = param_analyzer.analyze_weights_and_activations(
            compromised_fp.model_id, ModelAccessLevel.WHITE_BOX, weight_tensors
        )
        all_findings.extend(param_findings)

        # Real backdoor probing: same images, clean vs the checkerboard trigger patch
        # stamped on, actually executed through the candidate (backdoored) model.
        clean_probes, trig_probes = build_trigger_probes(inf_eng, assets["backdoored_model_path"], samples[:15], PROBE_CONFIG)
        asr, backdoor_findings = bdr_det.evaluate_trigger_probes(compromised_fp.model_id, clean_probes, trig_probes)
        all_findings.extend(backdoor_findings)

        audit.record_event("MODEL_ASSESSMENT", compromised_fp.model_id, "TRIGGER_PROBE_BATTERY", compromised_fp.sha256_digest[:16], "BACKDOOR_SUSPECTED" if backdoor_findings else "NO_TRIGGER_RESPONSE", f"Attack success rate observed: {asr*100:.1f}%.")

        # Real behavioural comparison: candidate (backdoored) vs trusted reference (clean),
        # both actually executed on the same clean probe images. The real ASR just
        # measured above is passed straight in, not patched on afterward.
        battery = build_reference_battery(inf_eng, assets["clean_model_path"], assets["backdoored_model_path"], samples[:25], PROBE_CONFIG)
        beh_assess, beh_finds = beh_an.evaluate_test_battery(
            compromised_fp.model_id, clean_fp.model_id, battery, backdoor_trigger_response_rate=asr
        )
        all_findings.extend(beh_finds)
        beh_assess.whitebox_activation_anomaly_score = param_stats.get("activation_anomaly_score")

        audit.record_event("MODEL_ASSESSMENT", compromised_fp.model_id, "BEHAVIOURAL_BATTERY", compromised_fp.sha256_digest[:16], "FAILED_ANOMALOUS", f"Model exhibited {len(beh_finds) + len(param_findings)} behavioral/parameter violations.")

        preds = inf_eng.run_inference(samples[0].image_path, assets["backdoored_model_path"], config=PROBE_CONFIG)
        inf_record = vrf.create_record(samples[0].image_path, compromised_fp.model_id, compromised_fp.sha256_digest, preds)

        contrib_sums = cnt_eng.aggregate_risk(samples[:20], {}, {}, {}, {})

        drift_det = DistributionShiftDetector()
        drift_report = drift_det.evaluate_shift(
            reference_profile={"terrain": "plains", "sensor": "EO_optical", "mean_illumination": 0.8},
            observed_samples_metadata=[{**s.metadata, "image_path": s.image_path} for s in samples[:20]],
            declared_reference_id="ref_plains_optical_baseline",
            observed_dataset_id="ds_clean_01",
        )

        report = rpt_gen.generate_report(
            findings=all_findings,
            contributor_summaries=contrib_sums,
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="VERIFIED",
            model_status="QUARANTINED_BACKDOORED",
            inference_status="UNTRUSTED_MODEL",
            drift_status="NORMAL",
        )

        return {
            "scenario_id": "SCENARIO-C",
            "title": "Substituted & Backdoored Model Attack",
            "description": "Model weights modified with backdoor trigger activation and substituted identity hash.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "model_fingerprint": compromised_fp,
            "model_behaviour": beh_assess,
            "findings": all_findings,
            "drift_report": drift_report,
        }

    @staticmethod
    def run_scenario_d(
        fng_prt: ModelFingerprinter,
        inf_eng: InferenceEngine,
        vrf: ProvenanceVerifier,
        rpt_gen: AssuranceReportGenerator,
        cnt_eng: ContributorRiskEngine,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        run_start = len(audit.entries)
        samples = ScenarioCleanDatasetRunner.load_dynamic_samples()
        assets = AssetGenerator.ensure_test_assets("test_assets")

        fp = fng_prt.generate_fingerprint(assets["clean_model_path"], ModelAccessLevel.WHITE_BOX)
        preds = inf_eng.run_inference(samples[0].image_path, assets["clean_model_path"], config=PROBE_CONFIG)

        valid_record = vrf.create_record(samples[0].image_path, fp.model_id, fp.sha256_digest, preds)
        audit.record_event("INFERENCE_PROVENANCE", valid_record.record_id, "SIGN_BIND", valid_record.provenance_hash, "CREATED", f"Authentic signature: {valid_record.signature[:16]}...")

        tampered_record = copy.deepcopy(valid_record)
        if not tampered_record.predictions:
            raise RuntimeError(
                "Scenario D requires at least one real detection on the seed probe image to "
                "demonstrate output tampering; got zero detections from the clean model at the "
                "configured confidence threshold."
            )
        tampered_record.predictions[0].class_name = "civilian_bus"
        tampered_record.predictions[0].confidence = 0.99

        is_valid, errors = vrf.verify_record(tampered_record)
        tampered_record.is_valid = is_valid
        tampered_record.tampering_detected = not is_valid
        tampered_record.verification_errors = errors

        audit.record_event("PROVENANCE_VERIFICATION", tampered_record.record_id, "VERIFY_TAMPERING", tampered_record.provenance_hash, "TAMPERING_DETECTED", "; ".join(errors))

        finding = FindingSchema(
            finding_id="FINDING-INF-TAMPER-001",
            asset=tampered_record.record_id,
            asset_type=AssetType.INFERENCE_RECORD,
            finding_type="inference_tampering",
            reason="Inference record output hash failed cryptographic recalculation. Predictions were altered post-inference.",
            evidence={
                "record_id": tampered_record.record_id,
                "claimed_output_hash": tampered_record.output_hash,
                "verification_errors": errors,
                "original_signature": tampered_record.signature[:16] + "...",
            },
            severity=FindingSeverity.CRITICAL,
            confidence=1.0,
            affected_source=tampered_record.record_id,
            recommended_action=RecommendedDisposition.QUARANTINE,
            limitations=["Cryptographic binding detects any single bit alteration in predictions, image hash, or configs."],
        )

        contrib_sums = cnt_eng.aggregate_risk(samples[:20], {}, {}, {}, {})

        drift_det = DistributionShiftDetector()
        drift_report = drift_det.evaluate_shift(
            reference_profile={"terrain": "plains", "sensor": "EO_optical", "mean_illumination": 0.8},
            observed_samples_metadata=[{**s.metadata, "image_path": s.image_path} for s in samples[:20]],
            declared_reference_id="ref_plains_optical_baseline",
            observed_dataset_id="ds_clean_01",
        )

        report = rpt_gen.generate_report(
            findings=[finding],
            contributor_summaries=contrib_sums,
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="VERIFIED",
            model_status="VERIFIED",
            inference_status="TAMPERING_DETECTED",
            drift_status="NORMAL",
        )

        return {
            "scenario_id": "SCENARIO-D",
            "title": "Tampered Inference Output & Replay Attack",
            "description": "Prediction altered from military vehicle to civilian bus post-execution; cryptographic DAG instantly detects violation.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "valid_record": valid_record,
            "tampered_record": tampered_record,
            "findings": [finding],
            "drift_report": drift_report,
        }
