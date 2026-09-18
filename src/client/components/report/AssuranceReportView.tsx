import React from "react";
import Image from "next/image";
import { Download, FileText, FileType } from "lucide-react";
import { AssuranceReport } from "@/shared/types/assurance";
import { StatusBadge } from "../ui/StatusBadge";
import { RiskMeter } from "../ui/RiskMeter";
import { AssuranceApiClient } from "@/client/lib/api-client";

interface AssuranceReportViewProps {
  report: AssuranceReport;
}

export const AssuranceReportView: React.FC<AssuranceReportViewProps> = ({
  report,
}) => {
  const handleDownloadJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `SENTINEL_ASSURANCE_REPORT_${report.report_id}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo_withoutlabel.png"
                alt="Sentinel Assurance"
                width={24}
                height={24}
                className="h-6 w-auto object-contain"
              />
              <h2 className="text-base font-bold tracking-wider text-zinc-100 uppercase">
                FORMAL ASSURANCE DISPOSITION CERTIFICATE (FR-14)
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Ministry of Defence (MoD) — Indian Army (DGIS) • PS ID:{" "}
              {report.problem_statement_id}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={AssuranceApiClient.reportExportUrl(report.report_id, "pdf")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded border border-rose-600/50 bg-rose-950/70 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-900/80 transition-colors cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.25)]"
            >
              <FileType className="h-3.5 w-3.5 text-rose-400" />
              Export Signed Sentinel Assurance Report (PDF)
            </a>
            <a
              href={AssuranceApiClient.reportExportUrl(
                report.report_id,
                "html",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-zinc-400" />
              EXPORT HTML
            </a>
            <button
              onClick={handleDownloadJSON}
              className="flex items-center gap-1.5 rounded border border-emerald-600/50 bg-emerald-950/70 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/80 transition-colors cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.25)]"
            >
              <Download className="h-3.5 w-3.5" />
              EXPORT JSON
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase">
              RECOMMENDED DISPOSITION
            </div>
            <div className="pt-1">
              <StatusBadge status={report.overall_disposition} size="lg" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase">
              REPORT ID & TIMESTAMP
            </div>
            <div className="text-xs font-bold text-zinc-200">
              {report.report_id}
            </div>
            <div className="text-[10px] text-zinc-400">
              {report.generated_at}
            </div>
            <div className="text-[10px] text-zinc-500">
              Policy:{" "}
              <span className="text-cyan-400/90 font-mono">
                {report.policy_version}
              </span>
            </div>
          </div>

          <div>
            <RiskMeter score={report.overall_risk_score} />
          </div>
        </div>

        {report.findings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2">
              EVIDENCE FINDINGS ({report.findings.length})
            </h4>
            <div className="space-y-2">
              {report.findings.map((f) => (
                <div
                  key={f.finding_id}
                  className="rounded border border-zinc-800/80 bg-zinc-900/30 p-3 space-y-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500">
                        {f.finding_id}
                      </span>
                      <span className="font-bold text-zinc-200">
                        {f.finding_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={f.severity} size="sm" />
                      <StatusBadge status={f.recommended_action} size="sm" />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {f.reason}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                    <span>
                      Asset: <span className="text-zinc-300">{f.asset}</span>
                    </span>
                    <span>
                      Confidence:{" "}
                      <span className="text-zinc-300">
                        {f.confidence.toFixed(2)}
                      </span>
                    </span>
                    {f.affected_source && (
                      <span>
                        Source:{" "}
                        <span className="text-zinc-300">
                          {f.affected_source}
                        </span>
                      </span>
                    )}
                  </div>
                  {f.access_assumptions.length > 0 && (
                    <div className="text-[10px] text-cyan-400/80">
                      Access assumption: {f.access_assumptions.join(" ")}
                    </div>
                  )}
                  {f.limitations.length > 0 && (
                    <ul className="list-disc list-inside text-[10px] text-amber-400/70 space-y-0.5">
                      {f.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2">
            ATTACK CLASS COVERAGE STATEMENT (PRD SECTION 15)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {report.coverage_statements.map((c) => (
              <div
                key={c.attack_class}
                className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 uppercase text-[11px]">
                    {c.attack_class.replace(/_/g, " ")}
                  </span>
                  <StatusBadge status={c.status} size="sm" />
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  {c.description}
                </p>
                <div className="text-[10px] text-cyan-400/80 font-mono">
                  Method: {c.validation_method}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3.5 space-y-2 text-xs">
            <div className="text-zinc-400 font-bold uppercase text-[11px]">
              DECLARED ASSUMPTIONS
            </div>
            <ul className="list-disc list-inside space-y-1 text-zinc-300 text-[11px]">
              {report.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3.5 space-y-2 text-xs">
            <div className="text-amber-400 font-bold uppercase text-[11px]">
              KNOWN EVALUATION LIMITATIONS (PRD SECTION 16)
            </div>
            <ul className="list-disc list-inside space-y-1 text-zinc-300 text-[11px]">
              {report.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
