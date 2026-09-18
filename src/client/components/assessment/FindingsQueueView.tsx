"use client";

import React, { useState } from "react";
import clsx from "clsx";
import {
  Download,
  Filter,
  Ban,
  Eye,
  CheckCircle2,
  Cpu,
  Shield,
  Activity,
  FileType,
} from "lucide-react";
import {
  FindingSchema,
  FindingSeverity,
  RecommendedDisposition,
} from "@/shared/types/assurance";
import {
  AssuranceApiClient,
  StoredReportSummary,
} from "@/client/lib/api-client";

interface FindingItem {
  key: string;
  findingId: string;
  code: string;
  reportId?: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  affectedAsset: string;
  category: string;
  confidence: number;
  recommendedDisposition: {
    label: string;
    actionType: RecommendedDisposition;
  };
}

function sentinelFindingTitle(findingType: string): string {
  const normalized = findingType.toLowerCase();
  if (normalized.includes("trigger") || normalized.includes("patch")) {
    return "LOCALIZED PATCH ANOMALY (LAPLACIAN KURTOSIS)";
  }
  if (normalized.includes("duplicate")) {
    return "REDUNDANT VIDEO FRAME BURST (dHash CLUSTER)";
  }
  if (normalized.includes("label") || normalized.includes("poison")) {
    return "SYSTEMATIC ANNOTATION CORRUPTION";
  }
  return findingType.replace(/_/g, " ").toUpperCase();
}

export interface FindingsQueueViewProps {
  findings?: Array<FindingSchema & { report_id?: string }>;
  activeReportId?: string;
  reportSummaries?: StoredReportSummary[];
  scope?: "fleet" | "assessment";
  onScopeChange?: (scope: "fleet" | "assessment") => void;
  onSelectReportId?: (reportId: string) => void;
  onSelectFinding?: (findingId: string, reportId?: string) => void;
}

export const FindingsQueueView: React.FC<FindingsQueueViewProps> = ({
  findings,
  activeReportId,
  reportSummaries = [],
  scope = "fleet",
  onScopeChange,
  onSelectReportId,
  onSelectFinding,
}) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const rawList: FindingItem[] = (findings || []).map((f, idx) => {
    const type = f.finding_type.toLowerCase();
    const repId = f.report_id || activeReportId || "fleet";
    const rawFid = f.finding_id || `F-${String(idx + 1).padStart(3, "0")}`;
    return {
      key: `${repId}_${rawFid}_${idx}`,
      findingId: rawFid,
      code: rawFid,
      reportId: f.report_id || activeReportId,
      severity: f.severity,
      title: sentinelFindingTitle(f.finding_type),
      description: f.reason,
      affectedAsset: `${f.asset_type}: ${f.asset}`,
      category:
        type.includes("backdoor") ||
        type.includes("trojan") ||
        type.includes("trigger") ||
        type.includes("poison") ||
        type.includes("signature")
          ? type.includes("poison") || type.includes("label")
            ? "QUALITY ANOMALY"
            : "SUSPECT CONTRIBUTOR"
          : type.includes("drift") ||
              type.includes("shift") ||
              type.includes("covariate") ||
              type.startsWith("ood_")
            ? "Data Drift"
            : "Data / Model Integrity",
      confidence: Math.round(
        f.confidence > 1 ? f.confidence : f.confidence * 100,
      ),
      recommendedDisposition: {
        label: f.recommended_action,
        actionType: f.recommended_action,
      },
    };
  });

  const filteredFindings = rawList.filter((f) => {
    if (selectedSeverity !== "ALL" && f.severity !== selectedSeverity) {
      return false;
    }
    if (selectedCategory !== "ALL") {
      if (selectedCategory === "EVASION" && !f.category.includes("Security"))
        return false;
      if (selectedCategory === "DRIFT" && !f.category.includes("Drift"))
        return false;
      if (selectedCategory === "INTEGRITY" && !f.category.includes("Integrity"))
        return false;
    }
    return true;
  });

  const criticalCount = rawList.filter((f) => f.severity === "CRITICAL").length;
  const highCount = rawList.filter((f) => f.severity === "HIGH").length;



  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Findings Queue
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-mono">
            <Filter className="h-3 w-3 text-sky-500" />
            <span>
              Displaying {filteredFindings.length} active anomalies requiring
              disposition.
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* If an active assessment is selected, allow downloading official PDF report */}
          {activeReportId && (
            <a
              href={AssuranceApiClient.reportExportUrl(activeReportId, "pdf")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-mono text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              title="Download Official Defense PDF Certificate (FR-14)"
            >
              <FileType className="h-3.5 w-3.5 text-rose-600" />
              <span>Download PDF Report</span>
            </a>
          )}

          {/* Export JSON */}
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(rawList, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `findings_${scope}_export.json`;
              a.click();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Scope Selector Bar */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-400 font-bold uppercase text-[10px]">
            QUEUE SCOPE:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => onScopeChange?.("fleet")}
              className={clsx(
                "px-3 py-1 rounded-md font-bold transition-all text-xs cursor-pointer",
                scope === "fleet"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              All Fleet Findings ({rawList.length})
            </button>
            <button
              type="button"
              onClick={() => onScopeChange?.("assessment")}
              className={clsx(
                "px-3 py-1 rounded-md font-bold transition-all text-xs cursor-pointer",
                scope === "assessment"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              By Assessment Subject
            </button>
          </div>

          {scope === "assessment" && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold uppercase text-[10px]">
                ASSESSMENT:
              </span>
              <select
                value={activeReportId || ""}
                onChange={(e) => onSelectReportId?.(e.target.value)}
                className="font-mono text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
              >
                {reportSummaries.map((s) => (
                  <option key={s.report_id} value={s.report_id}>
                    {s.report_id} ({s.overall_disposition} • Score{" "}
                    {Math.round(s.assurance_score)}/100)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Severity & Category Filter Buttons */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 py-1 px-2.5 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="EVASION">Security / Evasion</option>
            <option value="DRIFT">Data Drift</option>
            <option value="INTEGRITY">Data / Model Integrity</option>
          </select>

          <div className="h-4 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() =>
              setSelectedSeverity(
                selectedSeverity === "CRITICAL" ? "ALL" : "CRITICAL",
              )
            }
            className={clsx(
              "px-2.5 py-1 rounded font-bold transition-colors cursor-pointer text-xs",
              selectedSeverity === "CRITICAL"
                ? "bg-rose-50 border border-rose-300 text-rose-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Critical ({criticalCount})
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedSeverity(selectedSeverity === "HIGH" ? "ALL" : "HIGH")
            }
            className={clsx(
              "px-2.5 py-1 rounded font-bold transition-colors cursor-pointer text-xs",
              selectedSeverity === "HIGH"
                ? "bg-rose-50/60 border border-rose-200 text-rose-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            High ({highCount})
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedSeverity(
                selectedSeverity === "MEDIUM" ? "ALL" : "MEDIUM",
              )
            }
            className={clsx(
              "px-2.5 py-1 rounded font-bold transition-colors cursor-pointer text-xs",
              selectedSeverity === "MEDIUM"
                ? "bg-amber-50 border border-amber-300 text-amber-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Medium
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedSeverity(selectedSeverity === "LOW" ? "ALL" : "LOW")
            }
            className={clsx(
              "px-2.5 py-1 rounded font-bold transition-colors cursor-pointer text-xs",
              selectedSeverity === "LOW"
                ? "bg-slate-100 border border-slate-300 text-slate-800 shadow-2xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Low
          </button>
        </div>
      </div>

      {/* Findings Cards List */}
      <div className="space-y-4">
        {filteredFindings.map((f) => (
          <div
            key={f.key}
            onClick={() => onSelectFinding?.(f.findingId, f.reportId)}
            className={clsx(
              "rounded-xl bg-white p-5 shadow-xs transition-all hover:shadow-sm cursor-pointer grid grid-cols-1 lg:grid-cols-12 gap-5 items-start",
              f.severity === "CRITICAL"
                ? "border border-rose-300 border-l-4 border-l-rose-600"
                : f.severity === "HIGH"
                  ? "border border-slate-200/90 border-l-4 border-l-rose-400"
                  : "border border-slate-200/90 border-l-4 border-l-amber-400",
            )}
          >
            {/* Left Main Content */}
            <div className="lg:col-span-8 space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "font-mono text-[10px] font-bold px-2 py-0.5 rounded text-white",
                      f.severity === "CRITICAL"
                        ? "bg-rose-600"
                        : f.severity === "HIGH"
                          ? "bg-rose-800"
                          : "bg-slate-500",
                    )}
                  >
                    ⚠ {f.severity}
                  </span>
                  <span className="font-mono text-xs text-slate-700 font-bold break-all">
                    {f.code}
                  </span>
                  {f.reportId && (
                    <span className="font-mono text-[11px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium break-all">
                      {f.reportId}
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-base font-bold text-slate-900 tracking-tight mt-1 break-words">
                {f.title}
              </h3>

              <p className="text-xs text-slate-600 leading-relaxed break-words">
                {f.description}
              </p>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-slate-500">
                <div className="min-w-0 break-all">
                  <span className="text-slate-400">AFFECTED ASSET: </span>
                  <strong className="text-slate-800">{f.affectedAsset}</strong>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">CATEGORY: </span>
                  {f.category.includes("Security") ? (
                    <Shield className="h-3.5 w-3.5 text-rose-500 inline" />
                  ) : f.category.includes("Drift") ? (
                    <Activity className="h-3.5 w-3.5 text-sky-500 inline" />
                  ) : (
                    <Cpu className="h-3.5 w-3.5 text-amber-500 inline" />
                  )}
                  <span className="text-slate-800 font-medium">
                    {f.category}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action / Disposition Column */}
            <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-5 flex flex-col justify-between h-full space-y-4 font-mono">
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  <span>DETECTION CONFIDENCE</span>
                  <span className="text-slate-900 font-mono text-xs font-bold">
                    {f.confidence}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      "h-2 rounded-full transition-all",
                      f.severity === "CRITICAL"
                        ? "bg-rose-600"
                        : f.severity === "HIGH"
                          ? "bg-sky-600"
                          : "bg-slate-400",
                    )}
                    style={{ width: `${f.confidence}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  RECOMMENDED ACTION
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFinding?.(f.findingId, f.reportId);
                  }}
                  className={clsx(
                    "w-full py-2 px-3 rounded-lg border text-xs font-mono font-bold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                    f.recommendedDisposition.actionType === "QUARANTINE"
                      ? "border-rose-300 text-rose-700 bg-rose-50/50 hover:bg-rose-100/70"
                      : f.recommendedDisposition.actionType === "REVIEW"
                        ? "border-sky-300 text-sky-800 bg-sky-50/50 hover:bg-sky-100/70"
                        : "border-slate-300 text-slate-700 bg-slate-50/50 hover:bg-slate-100/70",
                  )}
                >
                  {f.recommendedDisposition.actionType === "QUARANTINE" ? (
                    <Ban className="h-3.5 w-3.5" />
                  ) : f.recommendedDisposition.actionType === "REVIEW" ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>{f.recommendedDisposition.label} · INVESTIGATE</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredFindings.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-bold text-slate-700">
              {rawList.length === 0
                ? "No active findings recorded."
                : "No findings match the selected severity filter."}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              {rawList.length === 0
                ? "Run an automated assessment or drop an asset to detect anomalies."
                : "Reset filters to view all recorded anomalies."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
