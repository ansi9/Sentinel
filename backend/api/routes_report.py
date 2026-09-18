import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, HTTPException, Response
from ..assurance.report_generator import AssuranceReportGenerator
from ..assurance.report_exporters import render_html_report, render_pdf_report
from ..audit.audit_log import shared_ledger
from ..persistence import db
from ..schemas import AssuranceReport, ContributorRiskSummary, FindingSchema, RecommendedDisposition

router = APIRouter(prefix="/api/report", tags=["Assurance Reports"])
report_gen = AssuranceReportGenerator()


@router.post("/generate", response_model=AssuranceReport)
async def generate_assurance_report(
    findings: List[FindingSchema] = Body(default=[]),
    contributor_summaries: List[ContributorRiskSummary] = Body(default=[]),
    audit_chain_digest: Optional[str] = Body(
        default=None,
        description="Defaults to the real, current shared audit ledger chain digest when omitted.",
    ),
    audit_chain_valid: Optional[bool] = Body(
        default=None,
        description="Defaults to the real, current shared audit ledger's own integrity check when omitted.",
    ),
    dataset_status: str = Body(default="VERIFIED"),
    model_status: str = Body(default="VERIFIED"),
    inference_status: str = Body(default="VERIFIED"),
    drift_status: str = Body(default="NORMAL"),
    custom_limitations: Optional[List[str]] = Body(default=None),
):
    if audit_chain_digest is None or audit_chain_valid is None:
        is_valid, _ = shared_ledger.verify_ledger_integrity()
        audit_chain_digest = audit_chain_digest or shared_ledger.current_chain_digest
        audit_chain_valid = audit_chain_valid if audit_chain_valid is not None else is_valid

    report = report_gen.generate_report(
        findings=findings,
        contributor_summaries=contributor_summaries,
        audit_chain_digest=audit_chain_digest,
        audit_chain_valid=audit_chain_valid,
        dataset_status=dataset_status,
        model_status=model_status,
        inference_status=inference_status,
        drift_status=drift_status,
        custom_limitations=custom_limitations,
    )

    db.insert_assurance_report(report.model_dump())
    shared_ledger.record_event(
        "ASSURANCE_REPORT", report.report_id, "GENERATE_REPORT", audit_chain_digest,
        report.overall_disposition.value, f"risk_score={report.overall_risk_score}, {len(findings)} finding(s)."
    )
    return report


@router.get("/list")
async def list_assurance_reports(limit: int = 100):
    """Real query against the persisted assurance-reports table."""
    return {"reports": db.list_assurance_reports(limit=limit)}


@router.get("/findings/all")
async def get_all_findings(limit: int = 150):
    """Returns all findings aggregated across stored assurance reports."""
    return {"findings": db.list_all_findings(limit=limit)}


@router.post("/{report_id}/findings/manual")
async def record_manual_finding(
    report_id: str,
    finding: FindingSchema = Body(...),
    actor: str = Body(default="Operator"),
):
    """Appends an analyst's manually verified finding to an existing assurance report
    and records an immutable entry in the shared audit ledger."""
    finding_dict = finding.model_dump()
    updated_report = db.add_manual_finding_to_report(report_id, finding_dict)
    if not updated_report:
        raise HTTPException(status_code=404, detail=f"No stored assurance report for report_id={report_id}")

    audit_entry = shared_ledger.record_event(
        "FINDING",
        finding.finding_id,
        "MANUAL_ENTRY",
        report_id,
        finding.severity.value,
        f"actor={actor}; type={finding.finding_type}; asset={finding.asset}; reason={finding.reason}",
    )
    return {"report": updated_report, "finding": finding_dict, "audit_entry": audit_entry}


@router.get("/trends/summary")
async def get_report_trends(limit: int = 200):
    """Aggregates every persisted assurance report into a historical
    trend view -- risk score over time, disposition mix, and per-contributor
    risk aggregated across all runs -- for the dashboard. Reads real,
    already-persisted reports; computes nothing new, just aggregates what
    every prior /report/generate or scenario run already wrote to the DB."""
    rows = db.list_assurance_reports(limit=limit)
    rows = list(reversed(rows))  # oldest first, for a left-to-right trend line

    disposition_counts: Dict[str, int] = {"ACCEPT": 0, "REVIEW": 0, "QUARANTINE": 0}
    contributor_totals: Dict[str, Dict[str, Any]] = {}
    timeline = []

    for row in rows:
        disposition = row.get("overall_disposition", "UNKNOWN")
        disposition_counts[disposition] = disposition_counts.get(disposition, 0) + 1
        timeline.append({
            "report_id": row["report_id"],
            "generated_at": row["generated_at"],
            "overall_risk_score": row["overall_risk_score"],
            "overall_disposition": disposition,
        })

        full_record = db.get_assurance_report(row["report_id"])
        if not full_record:
            continue
        report = json.loads(full_record["report_json"])
        for c in report.get("contributor_summaries", []):
            cid = c["contributor_id"]
            bucket = contributor_totals.setdefault(cid, {
                "contributor_id": cid, "appearances": 0, "risk_score_sum": 0.0,
                "max_risk_level": "LOW", "quarantine_count": 0,
            })
            bucket["appearances"] += 1
            bucket["risk_score_sum"] += c.get("risk_score", 0.0)
            severity_rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
            if severity_rank.get(c.get("risk_level", "LOW"), 0) > severity_rank.get(bucket["max_risk_level"], 0):
                bucket["max_risk_level"] = c.get("risk_level", "LOW")
            if c.get("recommended_action") == "QUARANTINE":
                bucket["quarantine_count"] += 1

    contributor_trends = []
    for bucket in contributor_totals.values():
        contributor_trends.append({
            **bucket,
            "avg_risk_score": round(bucket["risk_score_sum"] / max(1, bucket["appearances"]), 2),
        })
    contributor_trends.sort(key=lambda c: -c["avg_risk_score"])

    return {
        "total_reports": len(rows),
        "disposition_counts": disposition_counts,
        "timeline": timeline,
        "contributor_trends": contributor_trends,
    }


@router.post("/{report_id}/decision")
async def record_assurance_decision(
    report_id: str,
    decision: RecommendedDisposition = Body(...),
    notes: str = Body(default=""),
    actor: str = Body(default="unknown"),
):
    """Persists an analyst's final disposition decision on a previously
    generated assurance report and records the decision (who, what, and
    why) as a real, hash-chained entry in the shared audit ledger --
    replacing any client-side fabrication of that event. This is the only
    way a report's `overall_disposition` is ever changed after generation."""
    record = db.get_assurance_report(report_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No stored assurance report for report_id={report_id}")

    report = json.loads(record["report_json"])
    report["overall_disposition"] = decision.value
    db.insert_assurance_report(report)

    evidence = f"actor={actor}; notes={notes}" if notes else f"actor={actor}"
    audit_entry = shared_ledger.record_event(
        "ASSURANCE_REPORT", report_id, "RECORD_FINAL_DECISION",
        report.get("audit_chain_digest", ""), decision.value, evidence,
    )

    return {"report": report, "audit_entry": audit_entry}


@router.get("/{report_id}")
async def get_assurance_report_by_id(report_id: str):
    record = db.get_assurance_report(report_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No stored assurance report for report_id={report_id}")
    return record


def _load_report(report_id: str) -> AssuranceReport:
    record = db.get_assurance_report(report_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"No stored assurance report for report_id={report_id}")
    return AssuranceReport.model_validate(json.loads(record["report_json"]))


@router.get("/{report_id}/export.html")
async def export_assurance_report_html(report_id: str):
    """Renders the stored assurance report as a single self-contained HTML
    file (inline CSS, no external assets, no network calls) so an analyst
    can save/print/share it without needing this service running."""
    report = _load_report(report_id)
    html = render_html_report(report)
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.html"'},
    )


@router.get("/{report_id}/export.pdf")
async def export_assurance_report_pdf(report_id: str):
    """Renders the stored assurance report to PDF via reportlab (pure
    Python, no system rendering dependencies) for offline distribution."""
    report = _load_report(report_id)
    pdf_bytes = render_pdf_report(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'},
    )
