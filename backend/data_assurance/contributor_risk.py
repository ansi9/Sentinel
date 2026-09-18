from typing import Any, Dict, List
from collections import defaultdict
from ..ingestion.dataset_loader import SampleItem
from ..schemas import ContributorRiskSummary, FindingSeverity, RecommendedDisposition


class ContributorRiskEngine:
    def aggregate_risk(
        self,
        samples: List[SampleItem],
        dup_stats: Dict[str, Any],
        label_stats: Dict[str, Any],
        ood_stats: Dict[str, Any],
        poison_stats: Dict[str, Any],
    ) -> List[ContributorRiskSummary]:
        contributor_totals: Dict[str, int] = defaultdict(int)
        for s in samples:
            contributor_totals[s.contributor_id] += 1

        dup_counts: Dict[str, int] = defaultdict(int)
        for contrib, count in dup_stats.get("flooding_by_contributor", {}).items():
            dup_counts[contrib] = count

        label_counts: Dict[str, int] = defaultdict(int)
        for anomaly_id in label_stats.get("anomaly_sample_ids", []):
            sample_obj = next((s for s in samples if s.sample_id == anomaly_id), None)
            if sample_obj:
                label_counts[sample_obj.contributor_id] += 1

        ood_counts: Dict[str, int] = defaultdict(int)
        for ood in ood_stats.get("ood_records", []):
            ood_counts[ood["contributor_id"]] += 1

        trigger_counts: Dict[str, int] = defaultdict(int)
        for trig in poison_stats.get("trigger_records", []):
            trigger_counts[trig["contributor_id"]] += 1

        summaries: List[ContributorRiskSummary] = []

        for contributor, total in contributor_totals.items():
            dups = dup_counts[contributor]
            labels = label_counts[contributor]
            oods = ood_counts[contributor]
            trigs = trigger_counts[contributor]

            suspicious_total = dups + labels + oods + trigs

            dup_score = min(1.0, dups / max(1, total)) * 30.0
            label_score = min(1.0, labels / max(1, total)) * 35.0
            ood_score = min(1.0, oods / max(1, total)) * 15.0
            trig_score = min(1.0, trigs / max(1, total)) * 50.0

            raw_score = min(100.0, dup_score + label_score + ood_score + trig_score)

            if raw_score >= 45.0 or trigs > 0:
                risk_level = FindingSeverity.CRITICAL if raw_score >= 70.0 else FindingSeverity.HIGH
                action = RecommendedDisposition.QUARANTINE
            elif raw_score >= 15.0:
                risk_level = FindingSeverity.MEDIUM
                action = RecommendedDisposition.REVIEW
            else:
                risk_level = FindingSeverity.LOW
                action = RecommendedDisposition.ACCEPT

            summaries.append(
                ContributorRiskSummary(
                    contributor_id=contributor,
                    total_samples=total,
                    suspicious_samples=suspicious_total,
                    near_duplicates=dups,
                    label_anomalies=labels,
                    ood_samples=oods,
                    trigger_suspects=trigs,
                    risk_score=float(round(raw_score, 1)),
                    risk_level=risk_level,
                    recommended_action=action,
                )
            )

        summaries.sort(key=lambda x: x.risk_score, reverse=True)
        return summaries
