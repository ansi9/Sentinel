from typing import List, Tuple
from ..schemas import FindingSchema, FindingSeverity, RecommendedDisposition


class RiskEngine:
    """Disposition policy: severity weights and ACCEPT/REVIEW/QUARANTINE
    cutoffs. Bump POLICY_VERSION whenever these constants change -- the
    PRD (section 9.3) requires policy thresholds to be versioned and
    carried in every assurance report, so a report generated under one
    policy can never be silently misread as having been evaluated under
    another."""

    POLICY_VERSION = "policy-2026.2"

    SEVERITY_WEIGHTS = {
        FindingSeverity.LOW: 5.0,
        FindingSeverity.MEDIUM: 18.0,
        FindingSeverity.HIGH: 40.0,
        FindingSeverity.CRITICAL: 80.0,
    }

    # Calibrated marginal severity impact rates (bounded independent risk factors)
    SEVERITY_IMPACT = {
        FindingSeverity.LOW: 0.04,
        FindingSeverity.MEDIUM: 0.12,
        FindingSeverity.HIGH: 0.28,
        FindingSeverity.CRITICAL: 0.50,
    }

    def compute_overall_risk(
        self,
        findings: List[FindingSchema],
    ) -> Tuple[float, float, RecommendedDisposition]:
        if not findings:
            return 4.2, 95.8, RecommendedDisposition.ACCEPT

        has_critical = any(f.severity == FindingSeverity.CRITICAL for f in findings)
        high_count = sum(1 for f in findings if f.severity == FindingSeverity.HIGH)
        med_count = sum(1 for f in findings if f.severity == FindingSeverity.MEDIUM)

        # Baseline inherent operational residual risk
        baseline_safety = 1.0 - 0.042

        # Bounded probabilistic risk accumulation across empirical findings
        unmitigated_safety = 1.0
        for f in findings:
            factor = self.SEVERITY_IMPACT.get(f.severity, 0.10)
            confidence = max(0.1, min(1.0, float(f.confidence)))
            p_defect = factor * confidence
            unmitigated_safety *= (1.0 - p_defect)

        accumulated_risk = 100.0 * (1.0 - (baseline_safety * unmitigated_safety))
        normalized_risk = float(min(100.0, max(0.0, round(accumulated_risk, 1))))
        assurance_score = float(max(0.0, min(100.0, round(100.0 - normalized_risk, 1))))

        if has_critical or high_count >= 2 or normalized_risk >= 60.0:
            disposition = RecommendedDisposition.QUARANTINE
        elif high_count == 1 or med_count >= 2 or normalized_risk >= 25.0:
            disposition = RecommendedDisposition.REVIEW
        else:
            disposition = RecommendedDisposition.ACCEPT

        return normalized_risk, assurance_score, disposition
