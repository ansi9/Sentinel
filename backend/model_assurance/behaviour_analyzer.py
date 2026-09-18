from typing import Any, Dict, List, Optional, Tuple
from ..schemas import (
    AssetType,
    FindingSchema,
    FindingSeverity,
    ModelAccessLevel,
    ModelBehaviourAssessment,
    RecommendedDisposition,
)


class BehaviourAnalyzer:
    def __init__(self, deviation_threshold: float = 0.05):
        self.deviation_threshold = deviation_threshold

    def evaluate_test_battery(
        self,
        model_id: str,
        reference_model_id: str,
        test_battery_results: List[Dict[str, Any]],
        access_level: ModelAccessLevel = ModelAccessLevel.WHITE_BOX,
        backdoor_trigger_response_rate: float = 0.0,
    ) -> Tuple[ModelBehaviourAssessment, List[FindingSchema]]:
        """`backdoor_trigger_response_rate` is the real attack-success-rate
        from `BackdoorDetector.evaluate_trigger_probes` run against this same
        candidate model, when the caller has also run that probe (see
        `api/routes_model.py: run_behaviour_battery`). This function has no
        way to compute it itself -- `test_battery_results` only carries
        reference-vs-candidate predictions on unmodified images, not
        clean-vs-triggered pairs -- so a caller that skips trigger probing
        gets an honest 0.0 (no probing performed), not a value that looks
        like a real "no backdoor detected" measurement."""
        total_tests = len(test_battery_results)
        matching_count = 0
        deviant_records = []
        conf_drifts = []

        for probe in test_battery_results:
            ref_pred = probe.get("expected_class")
            obs_pred = probe.get("observed_class")
            ref_conf = probe.get("expected_confidence", 0.9)
            obs_conf = probe.get("observed_confidence", 0.9)

            conf_drift = abs(ref_conf - obs_conf)
            conf_drifts.append(conf_drift)

            if ref_pred == obs_pred and conf_drift < 0.2:
                matching_count += 1
            else:
                deviant_records.append({
                    "probe_id": probe.get("probe_id", f"probe_{len(deviant_records)}"),
                    "input_type": probe.get("input_type", "tactical_vehicle"),
                    "expected_class": ref_pred,
                    "observed_class": obs_pred,
                    "expected_confidence": ref_conf,
                    "observed_confidence": obs_conf,
                    "confidence_drift": float(round(conf_drift, 3)),
                })

        deviant_count = len(deviant_records)
        dev_rate = deviant_count / max(1, total_tests)
        mean_conf_drift = float(sum(conf_drifts) / max(1, len(conf_drifts)))

        findings: List[FindingSchema] = []
        status = "NORMAL"

        if dev_rate > self.deviation_threshold:
            status = "ANOMALOUS"
            severity = FindingSeverity.CRITICAL if dev_rate > 0.25 else FindingSeverity.HIGH
            findings.append(
                FindingSchema(
                    finding_id="FINDING-MDL-BEH-001",
                    asset=model_id,
                    asset_type=AssetType.MODEL,
                    finding_type="anomalous_behaviour",
                    reason=f"Supplied model diverged on {deviant_count}/{total_tests} test battery probes ({dev_rate*100:.1f}% divergence).",
                    evidence={
                        "total_probes": total_tests,
                        "deviations_count": deviant_count,
                        "deviation_rate": round(dev_rate, 3),
                        "mean_confidence_drift": round(mean_conf_drift, 3),
                        "deviant_probes": deviant_records[:8],
                    },
                    severity=severity,
                    confidence=0.95,
                    affected_source=model_id,
                    recommended_action=RecommendedDisposition.QUARANTINE if severity == FindingSeverity.CRITICAL else RecommendedDisposition.REVIEW,
                    limitations=["Reference battery evaluates bounded semantic envelope; real-world edge cases may exist."],
                    access_assumptions=[
                        f"Assessed at declared access_level={access_level.value}: real input/output execution "
                        "against the same probe images was available for this comparison."
                    ],
                )
            )

        assessment = ModelBehaviourAssessment(
            model_id=model_id,
            reference_model_id=reference_model_id,
            access_level=access_level,
            total_battery_tests=total_tests,
            matching_predictions=matching_count,
            deviant_predictions=deviant_count,
            mean_confidence_drift=float(round(mean_conf_drift, 4)),
            backdoor_trigger_response_rate=float(round(backdoor_trigger_response_rate, 4)),
            assessment_status=status,
            limitations=[
                "Assessment calibrated against fixed 50-probe tactical test suite.",
            ] if access_level == ModelAccessLevel.WHITE_BOX else [
                "Assessment calibrated against fixed 50-probe tactical test suite.",
                "White-box activation and gradient inspections are unavailable in black-box mode.",
            ],
        )

        return assessment, findings
