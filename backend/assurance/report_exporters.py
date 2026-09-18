import os
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..schemas import AssuranceReport

_TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "j2"]),
)


def render_html_report(report: AssuranceReport) -> str:
    """Renders the assurance report to a single, self-contained HTML
    document (inline CSS, no external assets) using a local Jinja2
    template -- no network access, no external renderer."""
    template = _env.get_template("report.html.j2")
    return template.render(report=report)


def render_pdf_report(report: AssuranceReport) -> bytes:
    """Renders the assurance report to PDF using reportlab (pure Python,
    no system-level rendering dependencies such as Cairo/Pango), so it
    works in an air-gapped environment with only pre-provisioned wheels."""
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
    )

    def _enum_val(v: Any) -> str:
        return v.value if hasattr(v, "value") else str(v)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    h2_style = styles["Heading2"]
    body_style = ParagraphStyle("body_small", parent=styles["BodyText"], fontSize=7.5, leading=9.5)
    meta_style = ParagraphStyle("meta", parent=styles["BodyText"], fontSize=8.5, leading=11, textColor=colors.HexColor("#555555"))

    tbl_header_style = ParagraphStyle(
        "tbl_header",
        parent=styles["Normal"],
        fontSize=7.5,
        leading=9.5,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#1e293b"),
    )
    tbl_id_style = ParagraphStyle(
        "tbl_id",
        parent=styles["Normal"],
        fontSize=6.8,
        leading=8.5,
        fontName="Courier",
        textColor=colors.HexColor("#0f172a"),
    )
    tbl_cell_style = ParagraphStyle(
        "tbl_cell",
        parent=styles["Normal"],
        fontSize=7.2,
        leading=9.0,
        textColor=colors.HexColor("#334155"),
    )
    tbl_center_style = ParagraphStyle(
        "tbl_center",
        parent=styles["Normal"],
        fontSize=7.2,
        leading=9.0,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#334155"),
    )

    disposition_colors = {
        "ACCEPT": colors.HexColor("#166534"),
        "REVIEW": colors.HexColor("#b45309"),
        "QUARANTINE": colors.HexColor("#b91c1c"),
    }
    severity_colors = {
        "CRITICAL": colors.HexColor("#b91c1c"),
        "HIGH": colors.HexColor("#c2410c"),
        "MEDIUM": colors.HexColor("#b45309"),
        "LOW": colors.HexColor("#166534"),
    }

    story = []
    story.append(Paragraph("IntelX Assurance Report", title_style))
    story.append(Paragraph(
        f"Report ID: {report.report_id} &nbsp;|&nbsp; Generated: {report.generated_at} &nbsp;|&nbsp; "
        f"Problem Statement {report.problem_statement_id} &nbsp;|&nbsp; {report.organization} &nbsp;|&nbsp; "
        f"Policy: {report.policy_version}",
        meta_style,
    ))
    story.append(Spacer(1, 8))

    disposition = _enum_val(report.overall_disposition)
    disp_style = ParagraphStyle("disp", parent=styles["Heading2"], textColor=disposition_colors.get(disposition, colors.black))
    story.append(Paragraph(f"Overall Disposition: {disposition} (risk score {report.overall_risk_score:.1f}/100)", disp_style))

    status_rows = [
        [Paragraph("<b>Dataset</b>", tbl_cell_style), Paragraph(str(report.dataset_assurance_status), tbl_cell_style)],
        [Paragraph("<b>Model</b>", tbl_cell_style), Paragraph(str(report.model_assurance_status), tbl_cell_style)],
        [Paragraph("<b>Inference Provenance</b>", tbl_cell_style), Paragraph(str(report.inference_provenance_status), tbl_cell_style)],
        [Paragraph("<b>Distribution Shift</b>", tbl_cell_style), Paragraph(str(report.distribution_shift_status), tbl_cell_style)],
        [Paragraph("<b>Audit Chain</b>", tbl_cell_style), Paragraph("VALID" if report.audit_chain_valid else "INVALID", tbl_cell_style)],
    ]
    t = Table(status_rows, colWidths=[54 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 6))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(Paragraph(f"Findings ({len(report.findings)})", h2_style))
    if report.findings:
        rows = [[
            Paragraph("ID", tbl_header_style),
            Paragraph("Asset", tbl_header_style),
            Paragraph("Type", tbl_header_style),
            Paragraph("Sev.", tbl_header_style),
            Paragraph("Conf.", tbl_header_style),
            Paragraph("Reason", tbl_header_style),
            Paragraph("Action", tbl_header_style),
        ]]
        for f in report.findings:
            sev = _enum_val(f.severity)
            sev_color = severity_colors.get(sev, colors.HexColor("#334155"))
            sev_style = ParagraphStyle(
                f"sev_{sev}",
                parent=tbl_center_style,
                fontName="Helvetica-Bold",
                textColor=sev_color,
            )

            rows.append([
                Paragraph(f.finding_id, tbl_id_style),
                Paragraph(f.asset, tbl_cell_style),
                Paragraph(f.finding_type, tbl_cell_style),
                Paragraph(sev, sev_style),
                Paragraph(f"{f.confidence:.2f}", tbl_center_style),
                Paragraph(f.reason, tbl_cell_style),
                Paragraph(_enum_val(f.recommended_action), tbl_center_style),
            ])
        ft = Table(rows, colWidths=[28 * mm, 24 * mm, 26 * mm, 14 * mm, 12 * mm, 52 * mm, 18 * mm], repeatRows=1)
        ft.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(ft)
    else:
        story.append(Paragraph("No findings recorded.", body_style))

    if report.contributor_summaries:
        story.append(Spacer(1, 10))
        story.append(Paragraph("Contributor / Source Risk Summary", h2_style))
        contrib_rows = [[
            Paragraph("Contributor", tbl_header_style),
            Paragraph("Total", tbl_header_style),
            Paragraph("Susp.", tbl_header_style),
            Paragraph("Dup.", tbl_header_style),
            Paragraph("Label", tbl_header_style),
            Paragraph("OOD", tbl_header_style),
            Paragraph("Trigger", tbl_header_style),
            Paragraph("Risk", tbl_header_style),
            Paragraph("Action", tbl_header_style),
        ]]
        for c in report.contributor_summaries:
            c_risk = _enum_val(c.risk_level)
            c_color = severity_colors.get(c_risk, colors.HexColor("#334155"))
            c_risk_style = ParagraphStyle(
                f"c_risk_{c_risk}",
                parent=tbl_center_style,
                fontName="Helvetica-Bold",
                textColor=c_color,
            )
            contrib_rows.append([
                Paragraph(c.contributor_id, tbl_id_style),
                Paragraph(str(c.total_samples), tbl_center_style),
                Paragraph(str(c.suspicious_samples), tbl_center_style),
                Paragraph(str(c.near_duplicates), tbl_center_style),
                Paragraph(str(c.label_anomalies), tbl_center_style),
                Paragraph(str(c.ood_samples), tbl_center_style),
                Paragraph(str(c.trigger_suspects), tbl_center_style),
                Paragraph(c_risk, c_risk_style),
                Paragraph(_enum_val(c.recommended_action), tbl_center_style),
            ])
        ct_table = Table(
            contrib_rows,
            colWidths=[42 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 20 * mm, 28 * mm],
            repeatRows=1,
        )
        ct_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(ct_table)

    story.append(Spacer(1, 10))
    story.append(Paragraph("Coverage Statement", h2_style))
    cov_rows = [[
        Paragraph("Attack Class", tbl_header_style),
        Paragraph("Status", tbl_header_style),
        Paragraph("Validation Method", tbl_header_style),
    ]]
    for c in report.coverage_statements:
        cov_rows.append([
            Paragraph(c.attack_class, tbl_id_style),
            Paragraph(_enum_val(c.status), tbl_center_style),
            Paragraph(c.validation_method, tbl_cell_style),
        ])
    ct = Table(cov_rows, colWidths=[48 * mm, 24 * mm, 102 * mm], repeatRows=1)
    ct.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(ct)

    story.append(PageBreak())
    story.append(Paragraph("Assumptions", h2_style))
    for a in report.assumptions:
        story.append(Paragraph(f"&bull; {a}", body_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Limitations", h2_style))
    for l in report.limitations:
        story.append(Paragraph(f"&bull; {l}", body_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"Audit chain digest: {report.audit_chain_digest}", meta_style))

    doc.build(story)
    return buf.getvalue()
