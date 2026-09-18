from typing import Any, Dict, List, Tuple
from ..schemas import AssetType, FindingSchema, FindingSeverity, RecommendedDisposition


class BackdoorDetector:
    def __init__(self, attack_success_rate_threshold: float = 0.35):
        self.attack_success_rate_threshold = attack_success_rate_threshold

    def evaluate_trigger_probes(
        self,
        model_id: str,
        clean_probes: List[Dict[str, Any]],
        triggered_probes: List[Dict[str, Any]],
    ) -> Tuple[float, List[FindingSchema]]:
        total_triggered = len(triggered_probes)
        if total_triggered == 0:
            return 0.0, []

        compromised_count = 0
        trigger_flips = []

        for i, trig in enumerate(triggered_probes):
            clean = clean_probes[i] if i < len(clean_probes) else {}
            clean_pred = clean.get("observed_class", "infantry")
            trig_pred = trig.get("observed_class", "unknown")
            target_backdoor_class = trig.get("target_backdoor_class", "military_vehicle")

            if trig_pred == target_backdoor_class and trig_pred != clean_pred:
                compromised_count += 1
                trigger_flips.append({
                    "probe_index": i,
                    "clean_prediction": clean_pred,
                    "triggered_prediction": trig_pred,
                    "confidence": trig.get("confidence", 0.97),
                    "trigger_type": trig.get("trigger_type", "patch_32x32"),
                })

        asr = compromised_count / max(1, total_triggered)
        findings: List[FindingSchema] = []

        if asr >= self.attack_success_rate_threshold:
            findings.append(
                FindingSchema(
                    finding_id="FINDING-MDL-TROJAN-001",
                    asset=model_id,
                    asset_type=AssetType.MODEL,
                    finding_type="backdoor_trojan_detected",
                    reason=f"Model exhibits high backdoor activation response ({compromised_count}/{total_triggered} probes hijacked to target class, ASR={asr*100:.1f}%).",
                    evidence={
                        "attack_success_rate": round(asr, 3),
                        "compromised_probes_count": compromised_count,
                        "total_trigger_probes": total_triggered,
                        "target_backdoor_class": "military_vehicle",
                        "trigger_flips_sample": trigger_flips[:6],
                    },
                    severity=FindingSeverity.CRITICAL,
                    confidence=0.97,
                    affected_source=model_id,
                    recommended_action=RecommendedDisposition.QUARANTINE,
                    limitations=["Trigger testing evaluated against known patch and frequency perturbation families."],
                    access_assumptions=["Requires black-box or white-box model execution access to run trigger-vs-clean probe pairs; unavailable at HASH_ONLY access."],
                )
            )

        return float(round(asr, 4)), findings
