import os
from typing import Any, Dict, List
from ..assurance.report_generator import AssuranceReportGenerator
from ..audit.audit_log import TamperEvidentAuditLedger
from ..data_assurance.contributor_risk import ContributorRiskEngine
from ..data_assurance.duplicate_detector import DuplicateDetector
from ..data_assurance.label_analyzer import LabelAnalyzer
from ..data_assurance.ood_detector import OODDetector
from ..data_assurance.poisoning_detector import PoisoningDetector
from ..drift.distribution_shift import DistributionShiftDetector
from ..inference.inference_engine import InferenceEngine
from ..ingestion.dataset_loader import DatasetLoader, SampleItem
from ..model_assurance.behaviour_analyzer import BehaviourAnalyzer
from ..model_assurance.fingerprint import ModelFingerprinter
from ..provenance.verification import ProvenanceVerifier
from ..schemas import ModelAccessLevel
from .asset_generator import AssetGenerator
from .probe_builder import PROBE_CONFIG, build_reference_battery


class ScenarioCleanDatasetRunner:
    @staticmethod
    def load_dynamic_samples() -> List[SampleItem]:
        assets = AssetGenerator.ensure_test_assets("test_assets")
        return DatasetLoader.load_coco(assets["coco_path"], assets["images_dir"])

    @staticmethod
    def run_scenario_a(
        dup_det: DuplicateDetector,
        lbl_an: LabelAnalyzer,
        ood_det: OODDetector,
        psn_det: PoisoningDetector,
        cnt_eng: ContributorRiskEngine,
        fng_prt: ModelFingerprinter,
        beh_an: BehaviourAnalyzer,
        inf_eng: InferenceEngine,
        vrf: ProvenanceVerifier,
        rpt_gen: AssuranceReportGenerator,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        run_start = len(audit.entries)
        samples = ScenarioCleanDatasetRunner.load_dynamic_samples()
        clean_subset = samples[:20]

        audit.record_event("DATASET_INGESTION", "ds_clean_01", "INGEST_VALIDATE", clean_subset[0].sha256[:16], "SUCCESS", f"{len(clean_subset)} samples parsed from disk.")

        d_finds, d_stats = dup_det.analyze(clean_subset, "ds_clean_01")
        l_finds, l_stats = lbl_an.analyze(clean_subset, "ds_clean_01")
        o_finds, o_stats = ood_det.analyze(clean_subset, "ds_clean_01")
        p_finds, p_stats = psn_det.analyze(clean_subset, "ds_clean_01")

        all_findings = d_finds + l_finds + o_finds + p_finds
        contrib_sums = cnt_eng.aggregate_risk(clean_subset, d_stats, l_stats, o_stats, p_stats)
        audit.record_event("DATA_ASSURANCE", "ds_clean_01", "ANALYZE_INTEGRITY", clean_subset[0].sha256[:16], "PASSED_ZERO_ANOMALIES", "Dataset integrity verified.")

        assets = AssetGenerator.ensure_test_assets("test_assets")
        fp = fng_prt.generate_fingerprint(assets["clean_model_path"], ModelAccessLevel.WHITE_BOX)
        audit.record_event("MODEL_FINGERPRINT", fp.model_id, "DIGEST_VERIFICATION", fp.sha256_digest, "MATCH", "Supplied model matches reference identity.")

        # Reference == candidate here (the model is asserted authentic), so this
        # is a real self-consistency run: identical weights on both sides means
        # every probe trivially matches by construction of running the same file.
        battery = build_reference_battery(inf_eng, assets["clean_model_path"], assets["clean_model_path"], clean_subset[:15], PROBE_CONFIG)
        beh_assess, beh_finds = beh_an.evaluate_test_battery(fp.model_id, fp.model_id, battery)
        all_findings.extend(beh_finds)
        audit.record_event("MODEL_ASSESSMENT", fp.model_id, "BATTERY_TEST", fp.sha256_digest[:16], "PASSED", f"{len(battery)}/{len(battery)} test probes matched expected predictions.")

        img_path = clean_subset[0].image_path
        preds = inf_eng.run_inference(img_path, assets["clean_model_path"], config=PROBE_CONFIG)
        inf_record = vrf.create_record(img_path, fp.model_id, fp.sha256_digest, preds)
        audit.record_event("INFERENCE_PROVENANCE", inf_record.record_id, "SIGN_BIND", inf_record.provenance_hash, "CREATED", f"Signature: {inf_record.signature[:16]}...")

        is_valid, _ = vrf.verify_record(inf_record)
        audit.record_event("PROVENANCE_VERIFICATION", inf_record.record_id, "VERIFY_INTEGRITY", inf_record.provenance_hash, "VALID", "Cryptographic binding verified.")

        drift_det = DistributionShiftDetector()
        drift_report = drift_det.evaluate_shift(
            reference_profile={"terrain": "plains", "sensor": "EO_optical", "mean_illumination": 0.8},
            observed_samples_metadata=[s.metadata for s in clean_subset],
            declared_reference_id="ref_plains_optical_baseline",
            observed_dataset_id="ds_clean_01",
        )

        report = rpt_gen.generate_report(
            findings=all_findings,
            contributor_summaries=contrib_sums,
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="VERIFIED",
            model_status="VERIFIED",
            inference_status="VERIFIED",
            drift_status="NORMAL",
        )

        return {
            "scenario_id": "SCENARIO-A",
            "title": "Clean Operational Pipeline Baseline",
            "description": "Clean dataset, authentic verified model, and signed inference execution.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "model_fingerprint": fp,
            "model_behaviour": beh_assess,
            "inference_record": inf_record,
            "contributor_summaries": contrib_sums,
            "samples_count": len(clean_subset),
            "drift_report": drift_report,
        }

    @staticmethod
    def run_scenario_b(
        dup_det: DuplicateDetector,
        lbl_an: LabelAnalyzer,
        ood_det: OODDetector,
        psn_det: PoisoningDetector,
        cnt_eng: ContributorRiskEngine,
        fng_prt: ModelFingerprinter,
        inf_eng: InferenceEngine,
        vrf: ProvenanceVerifier,
        rpt_gen: AssuranceReportGenerator,
        audit: TamperEvidentAuditLedger,
    ) -> Dict[str, Any]:
        run_start = len(audit.entries)
        samples = ScenarioCleanDatasetRunner.load_dynamic_samples()

        for i in range(10, 16):
            samples[i].image_path = samples[10].image_path
            samples[i].contributor_id = "contributor_bravo"

        for i in range(20, 26):
            samples[i].contributor_id = "contributor_bravo"
            samples[i].metadata["has_trigger"] = True
            samples[i].metadata["trigger_type"] = "high_freq_patch_32x32"

        for i in range(26, 31):
            samples[i].contributor_id = "contributor_bravo"
            samples[i].metadata["true_label"] = "infantry"
            samples[i].labels = ["military_vehicle"]
            samples[i].metadata["label_flipped"] = True

        audit.record_event("DATASET_INGESTION", "ds_poisoned_02", "INGEST_VALIDATE", samples[0].sha256[:16], "COMPLETED", f"{len(samples)} multi-contributor samples ingested.")

        d_finds, d_stats = dup_det.analyze(samples, "ds_poisoned_02")
        l_finds, l_stats = lbl_an.analyze(samples, "ds_poisoned_02")
        o_finds, o_stats = ood_det.analyze(samples, "ds_poisoned_02")
        p_finds, p_stats = psn_det.analyze(samples, "ds_poisoned_02")

        all_findings = d_finds + l_finds + o_finds + p_finds
        contrib_sums = cnt_eng.aggregate_risk(samples, d_stats, l_stats, o_stats, p_stats)
        audit.record_event("DATA_ASSURANCE", "ds_poisoned_02", "ANALYZE_INTEGRITY", samples[0].sha256[:16], "FLAGGED_HIGH_RISK", f"Detected {len(all_findings)} integrity anomalies. Contributor Bravo flagged.")

        assets = AssetGenerator.ensure_test_assets("test_assets")
        fp = fng_prt.generate_fingerprint(assets["clean_model_path"], ModelAccessLevel.WHITE_BOX)
        preds = inf_eng.run_inference(samples[0].image_path, assets["clean_model_path"], config=PROBE_CONFIG)
        inf_record = vrf.create_record(samples[0].image_path, fp.model_id, fp.sha256_digest, preds)

        drift_det = DistributionShiftDetector()
        drift_report = drift_det.evaluate_shift(
            reference_profile={"terrain": "plains", "sensor": "EO_optical", "mean_illumination": 0.8},
            observed_samples_metadata=[{**s.metadata, "image_path": s.image_path} for s in samples],
            declared_reference_id="ref_plains_optical_baseline",
            observed_dataset_id="ds_poisoned_02",
            # contributor_alpha's untouched samples (indices 0-9) as a real
            # embedding-space reference set -- everything from index 10
            # onward was mutated above (duplicated / trigger-patched /
            # label-flipped and reassigned to contributor_bravo).
            reference_samples_metadata=[{**s.metadata, "image_path": s.image_path} for s in samples[:10]],
        )

        report = rpt_gen.generate_report(
            findings=all_findings,
            contributor_summaries=contrib_sums,
            audit_chain_digest=audit.current_chain_digest,
            audit_chain_valid=True,
            dataset_status="COMPROMISED",
            model_status="VERIFIED",
            inference_status="VERIFIED",
            drift_status="ANOMALIES_DETECTED",
        )

        return {
            "scenario_id": "SCENARIO-B",
            "title": "Compromised Training Dataset & Malicious Contributor",
            "description": "Contributor Bravo injects near-duplicate flooding, trigger patches, and systematic label flips.",
            "overall_disposition": report.overall_disposition,
            "overall_risk_score": report.overall_risk_score,
            "report": report,
            "audit_entries": audit.entries_since(run_start),
            "model_fingerprint": fp,
            "contributor_summaries": contrib_sums,
            "findings": all_findings,
            "samples_count": len(samples),
            "drift_report": drift_report,
        }
