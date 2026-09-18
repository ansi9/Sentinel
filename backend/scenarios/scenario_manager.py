from typing import Any, Dict, List
from ..assurance.report_generator import AssuranceReportGenerator
from ..audit.audit_log import shared_ledger
from ..data_assurance.contributor_risk import ContributorRiskEngine
from ..data_assurance.duplicate_detector import DuplicateDetector
from ..data_assurance.label_analyzer import LabelAnalyzer
from ..data_assurance.ood_detector import OODDetector
from ..data_assurance.poisoning_detector import PoisoningDetector
from ..inference.inference_engine import InferenceEngine
from ..ingestion.dataset_loader import SampleItem
from ..model_assurance.backdoor_detector import BackdoorDetector
from ..model_assurance.behaviour_analyzer import BehaviourAnalyzer
from ..model_assurance.fingerprint import ModelFingerprinter
from ..provenance.verification import ProvenanceVerifier
from .scenario_clean import ScenarioCleanDatasetRunner
from .scenario_model_inf import ScenarioModelInferenceRunner
from .scenario_replay_audit import ScenarioReplayAuditRunner


class ScenarioManager:
    def __init__(self):
        self.dup_detector = DuplicateDetector()
        self.label_analyzer = LabelAnalyzer()
        self.ood_detector = OODDetector()
        self.poison_detector = PoisoningDetector()
        self.contrib_engine = ContributorRiskEngine()
        self.fingerprinter = ModelFingerprinter()
        self.behaviour_analyzer = BehaviourAnalyzer()
        self.backdoor_detector = BackdoorDetector()
        self.inference_engine = InferenceEngine()
        self.verifier = ProvenanceVerifier()
        self.report_gen = AssuranceReportGenerator()
        self.audit_ledger = shared_ledger

    def generate_base_samples(self, count: int = 50) -> List[SampleItem]:
        return ScenarioCleanDatasetRunner.generate_base_samples(count)

    def run_scenario_a_clean(self) -> Dict[str, Any]:
        return ScenarioCleanDatasetRunner.run_scenario_a(
            self.dup_detector,
            self.label_analyzer,
            self.ood_detector,
            self.poison_detector,
            self.contrib_engine,
            self.fingerprinter,
            self.behaviour_analyzer,
            self.inference_engine,
            self.verifier,
            self.report_gen,
            self.audit_ledger,
        )

    def run_scenario_b_poisoned(self) -> Dict[str, Any]:
        return ScenarioCleanDatasetRunner.run_scenario_b(
            self.dup_detector,
            self.label_analyzer,
            self.ood_detector,
            self.poison_detector,
            self.contrib_engine,
            self.fingerprinter,
            self.inference_engine,
            self.verifier,
            self.report_gen,
            self.audit_ledger,
        )

    def run_scenario_c_model_compromised(self) -> Dict[str, Any]:
        return ScenarioModelInferenceRunner.run_scenario_c(
            self.fingerprinter,
            self.behaviour_analyzer,
            self.backdoor_detector,
            self.inference_engine,
            self.verifier,
            self.report_gen,
            self.contrib_engine,
            self.audit_ledger,
        )

    def run_scenario_d_tampered_inference(self) -> Dict[str, Any]:
        return ScenarioModelInferenceRunner.run_scenario_d(
            self.fingerprinter,
            self.inference_engine,
            self.verifier,
            self.report_gen,
            self.contrib_engine,
            self.audit_ledger,
        )

    def run_scenario_e_replay(self) -> Dict[str, Any]:
        return ScenarioReplayAuditRunner.run_scenario_e_replay(
            self.fingerprinter,
            self.inference_engine,
            self.report_gen,
            self.contrib_engine,
            self.audit_ledger,
        )

    def run_scenario_f_audit_tamper(self) -> Dict[str, Any]:
        return ScenarioReplayAuditRunner.run_scenario_f_audit_tamper(
            self.report_gen,
            self.contrib_engine,
            self.audit_ledger,
        )
