"use client";

import React, { useState } from "react";
import clsx from "clsx";
import confetti from "canvas-confetti";
import {
  Database,
  Cpu,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ShieldCheck,
  FileType,
  Lock,
  X,
  FileCheck2,
  Eye,
} from "lucide-react";
import {
  AssuranceReport,
  FindingSchema,
  FindingSeverity,
  RecommendedDisposition,
  AuditLogEntry,
} from "@/shared/types/assurance";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { ExplorerSecondaryTab } from "@/client/components/layout/AppTopNav";

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

interface AssessmentExplorerViewProps {
  title?: string;
  subtitle?: string;
  report?: AssuranceReport | null;
  onInvestigate: () => void;
  onNavigateTab?: (tab: ExplorerSecondaryTab) => void;
  onSelectFinding?: (findingId: string) => void;
  onFinalizeDecision?: (
    decision: RecommendedDisposition,
    notes: string
  ) => Promise<{ report: AssuranceReport; audit_entry: AuditLogEntry } | null | void> | void;
  activeScenario: string;
  loading: boolean;
  onSelectScenario: (scenarioId: string) => void;
}

export const AssessmentExplorerView: React.FC<AssessmentExplorerViewProps> = ({
  report = null,
  onNavigateTab,
  onSelectFinding,
  onFinalizeDecision,
}) => {
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [sealResult, setSealResult] = useState<{
    decision: RecommendedDisposition;
    auditEntry?: AuditLogEntry;
    reportId: string;
  } | null>(null);

  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center font-sans space-y-3">
        <p className="text-base font-bold text-slate-800">No Assessment Loaded</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Please select an active assessment from the switcher above or drop an asset to begin evaluation.
        </p>
      </div>
    );
  }

  const disposition = report.overall_disposition;
  const assuranceScore = Math.round(report.assurance_score);
  const riskScore = Math.round(report.overall_risk_score);
  const riskLevel =
    riskScore <= 20 ? "LOW RISK" : riskScore <= 60 ? "MODERATE RISK" : "CRITICAL RISK";

  // Vector findings categorisation
  const datasetFindings = report.findings.filter(
    (f) =>
      f.asset_type === "dataset" ||
      f.finding_type.includes("DATASET") ||
      f.finding_type.includes("POISON") ||
      f.finding_type.includes("LABEL")
  );
  const modelFindings = report.findings.filter(
    (f) =>
      f.asset_type === "model" ||
      f.finding_type.includes("MODEL") ||
      f.finding_type.includes("BACKDOOR") ||
      f.finding_type.includes("WEIGHT")
  );
  const inferenceFindings = report.findings.filter(
    (f) =>
      f.asset_type === "inference_record" ||
      f.finding_type.includes("INFERENCE") ||
      f.finding_type.includes("REPLAY") ||
      f.finding_type.includes("TAMPER")
  );

  // Vector risk status helper
  const getVectorStatus = (
    findings: FindingSchema[],
    systemStatus: string
  ): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } => {
    if (systemStatus === "UNAVAILABLE" && findings.length === 0) {
      return { label: "UNAVAILABLE (Black-Box)", tone: "slate" };
    }
    const hasCrit = findings.some((f) => f.severity === "CRITICAL");
    const hasHigh = findings.some((f) => f.severity === "HIGH");
    const hasMed = findings.some((f) => f.severity === "MEDIUM" || f.severity === "LOW");

    if (hasCrit) return { label: "CRITICAL RISK", tone: "rose" };
    if (hasHigh) return { label: "HIGH RISK", tone: "rose" };
    if (hasMed) return { label: "MODERATE RISK", tone: "amber" };
    return { label: "CLEAN / VERIFIED", tone: "emerald" };
  };

  const datasetStatus = getVectorStatus(datasetFindings, report.dataset_assurance_status);
  const modelStatus = getVectorStatus(modelFindings, report.model_assurance_status);
  const inferenceStatus = getVectorStatus(inferenceFindings, report.inference_provenance_status);

  // Vector Progress percentages
  const calcScore = (findings: FindingSchema[], defaultGood: number) => {
    if (findings.length === 0) return defaultGood;
    let safety = 1.0;
    const severityImpact: Record<string, number> = {
      CRITICAL: 0.5,
      HIGH: 0.28,
      MEDIUM: 0.12,
      LOW: 0.04,
    };
    for (const f of findings) {
      const impact = severityImpact[f.severity] ?? 0.1;
      const conf = Math.max(0.1, Math.min(1.0, f.confidence || 0.8));
      safety *= 1.0 - impact * conf;
    }
    const score = Math.round(defaultGood * safety);
    return Math.max(5, Math.min(100, score));
  };

  const datasetScore =
    report.dataset_assurance_status === "UNAVAILABLE" && datasetFindings.length === 0
      ? null
      : calcScore(datasetFindings, 92);

  const modelScore =
    report.model_assurance_status === "UNAVAILABLE" && modelFindings.length === 0
      ? null
      : calcScore(modelFindings, 96);

  const inferenceScore =
    report.inference_provenance_status === "UNAVAILABLE" && inferenceFindings.length === 0
      ? null
      : calcScore(inferenceFindings, 99);

  const sortedFindings = [...report.findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence
  );

  const handleActionClick = async (targetDecision: RecommendedDisposition) => {
    if (!onFinalizeDecision) return;
    setSubmittingDecision(true);
    try {
      const defaultNote = `Operational assessment disposition recorded as ${targetDecision} by authorized station officer. Evaluated against multi-vector integrity criteria.`;
      const res = await onFinalizeDecision(targetDecision, defaultNote);
      setSealResult({
        decision: targetDecision,
        auditEntry: res?.audit_entry,
        reportId: report.report_id,
      });

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.5 },
        });
      } catch {}
    } catch (err) {
      console.error("Decision finalization failed:", err);
    } finally {
      setSubmittingDecision(false);
    }
  };

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* SUCCESS CONFIRMATION MODAL */}
      {sealResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={clsx(
                    "h-12 w-12 rounded-2xl flex items-center justify-center shadow-xs",
                    sealResult.decision === "ACCEPT"
                      ? "bg-emerald-100 text-emerald-700"
                      : sealResult.decision === "QUARANTINE"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-800"
                  )}
                >
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                    IMMUTABLE LEDGER SEALED
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
                    Disposition Recorded!
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setSealResult(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Assessment ID:</span>
                <span className="font-bold text-slate-900">{sealResult.reportId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Selected Disposition:</span>
                <span className="font-bold text-slate-900">{sealResult.decision}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Audit Ledger Tx:</span>
                <span className="text-slate-800 font-semibold">
                  Seq #{sealResult.auditEntry?.sequence_id ?? "RECORDED"}
                </span>
              </div>
              <div className="pt-1 text-[10px] text-slate-500 break-all">
                Hash: {sealResult.auditEntry?.entry_hash || report.audit_chain_digest}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <a
                href={AssuranceApiClient.reportExportUrl(sealResult.reportId, "pdf")}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-mono text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <FileType className="h-4 w-4 text-rose-600" />
                <span>PDF Report</span>
              </a>
              <button
                onClick={() => setSealResult(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & METADATA BAR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">
              Assessment:
            </span>
            <span className="font-mono text-sm font-bold text-slate-900">
              {report.report_id}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 font-sans">
            {report.organization} • Problem Statement {report.problem_statement_id} • Generated{" "}
            {report.generated_at.slice(0, 10)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Status: COMPLETED</span>
          </div>

          <div
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-mono font-bold border",
              riskScore <= 20
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : riskScore <= 60
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-rose-50 border-rose-200 text-rose-700"
            )}
          >
            <span>Risk: {riskLevel}</span>
          </div>
        </div>
      </div>

      {/* 2. THE THREE MAIN ASSET VECTORS (DATASET, MODEL, INFERENCE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Vector 1: DATASET */}
        <div
          onClick={() => onNavigateTab?.("assets")}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <Database className="h-4 w-4" />
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
                DATASET
              </span>
            </div>
            <span
              className={clsx(
                "font-mono text-[10px] font-bold px-2 py-0.5 rounded border",
                datasetStatus.tone === "emerald" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                datasetStatus.tone === "amber" && "bg-amber-50 text-amber-800 border-amber-200",
                datasetStatus.tone === "rose" && "bg-rose-50 text-rose-700 border-rose-200",
                datasetStatus.tone === "slate" && "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              ● {datasetStatus.label}
            </span>
          </div>
          <div className="pt-3 space-y-1">
            <div className="text-xs text-slate-600 font-sans">
              Poisoning • Label Flipping • Duplicates • OOD
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {datasetFindings.length} anomaly finding{datasetFindings.length === 1 ? "" : "s"} identified
            </div>
          </div>
        </div>

        {/* Vector 2: MODEL */}
        <div
          onClick={() => onNavigateTab?.("findings")}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700">
                <Radio className="h-4 w-4" />
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
                MODEL
              </span>
            </div>
            <span
              className={clsx(
                "font-mono text-[10px] font-bold px-2 py-0.5 rounded border",
                modelStatus.tone === "emerald" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                modelStatus.tone === "amber" && "bg-amber-50 text-amber-800 border-amber-200",
                modelStatus.tone === "rose" && "bg-rose-50 text-rose-700 border-rose-200",
                modelStatus.tone === "slate" && "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              ● {modelStatus.label}
            </span>
          </div>
          <div className="pt-3 space-y-1">
            <div className="text-xs text-slate-600 font-sans">
              Backdoor Triggers • Weight Anomaly • Substitution
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {modelFindings.length} model finding{modelFindings.length === 1 ? "" : "s"} identified
            </div>
          </div>
        </div>

        {/* Vector 3: INFERENCE */}
        <div
          onClick={() => onNavigateTab?.("assets")}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
                <Cpu className="h-4 w-4" />
              </div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
                INFERENCE
              </span>
            </div>
            <span
              className={clsx(
                "font-mono text-[10px] font-bold px-2 py-0.5 rounded border",
                inferenceStatus.tone === "emerald" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                inferenceStatus.tone === "amber" && "bg-amber-50 text-amber-800 border-amber-200",
                inferenceStatus.tone === "rose" && "bg-rose-50 text-rose-700 border-rose-200",
                inferenceStatus.tone === "slate" && "bg-slate-100 text-slate-600 border-slate-200"
              )}
            >
              ● {inferenceStatus.label}
            </span>
          </div>
          <div className="pt-3 space-y-1">
            <div className="text-xs text-slate-600 font-sans">
              Cryptographic Binding • Replay • Provenance
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {inferenceFindings.length} record integrity finding{inferenceFindings.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {/* 3. OVERALL ASSURANCE SCORE & VECTOR PROGRESS BARS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-600">
              OVERALL ASSURANCE SCORE
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Weighted structural assessment across training data, neural parameters, and inference outputs.
            </p>
          </div>

          <div className="flex items-baseline gap-1">
            <span
              className={clsx(
                "text-4xl font-extrabold tracking-tight font-sans",
                assuranceScore < 70
                  ? "text-rose-600"
                  : assuranceScore < 85
                    ? "text-amber-600"
                    : "text-emerald-600"
              )}
            >
              {assuranceScore}
            </span>
            <span className="text-base font-mono text-slate-400">/ 100</span>
          </div>
        </div>

        {/* The 3 Metric Bars */}
        <div className="space-y-4">
          {/* Dataset Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">Dataset Integrity</span>
              <span className="font-mono font-bold text-slate-700">
                {datasetScore !== null ? `${datasetScore}%` : "UNAVAILABLE"}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500",
                  datasetScore === null
                    ? "bg-slate-300 w-0"
                    : datasetScore < 70
                      ? "bg-rose-500"
                      : datasetScore < 85
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                )}
                style={{ width: datasetScore !== null ? `${datasetScore}%` : "0%" }}
              />
            </div>
          </div>

          {/* Model Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">Model Integrity</span>
              <span className="font-mono font-bold text-slate-700">
                {modelScore !== null ? `${modelScore}%` : "UNAVAILABLE (Black-Box)"}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500",
                  modelScore === null
                    ? "bg-slate-300 w-0"
                    : modelScore < 70
                      ? "bg-rose-500"
                      : modelScore < 85
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                )}
                style={{ width: modelScore !== null ? `${modelScore}%` : "0%" }}
              />
            </div>
          </div>

          {/* Output / Inference Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">Output & Provenance Integrity</span>
              <span className="font-mono font-bold text-slate-700">
                {inferenceScore !== null ? `${inferenceScore}%` : "UNAVAILABLE"}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500",
                  inferenceScore === null
                    ? "bg-slate-300 w-0"
                    : inferenceScore < 70
                      ? "bg-rose-500"
                      : inferenceScore < 85
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                )}
                style={{ width: inferenceScore !== null ? `${inferenceScore}%` : "0%" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. FINDINGS SECTION */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-slate-600" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
              FINDINGS ({sortedFindings.length})
            </h2>
          </div>
          <button
            onClick={() => onNavigateTab?.("findings")}
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 font-mono cursor-pointer"
          >
            View all in queue →
          </button>
        </div>

        {sortedFindings.length === 0 ? (
          <div className="p-6 rounded-xl bg-emerald-50/40 border border-emerald-200 text-center space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <div className="font-bold text-sm text-slate-900">
              Clean Assessment • 0 Vulnerabilities Detected
            </div>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              All multi-vector checks passed without anomalous findings. Neural weights, data annotations, and cryptographic records conform to defense baseline specifications.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedFindings.map((finding) => {
              const isCritical = finding.severity === "CRITICAL";
              const isHigh = finding.severity === "HIGH";
              const isMedium = finding.severity === "MEDIUM";

              return (
                <div
                  key={finding.finding_id}
                  className={clsx(
                    "p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all",
                    isCritical
                      ? "bg-rose-50/40 border-rose-200"
                      : isHigh
                        ? "bg-amber-50/30 border-amber-200"
                        : "bg-white border-slate-200"
                  )}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                          isCritical && "bg-rose-100 text-rose-800 border-rose-300",
                          isHigh && "bg-amber-100 text-amber-800 border-amber-300",
                          isMedium && "bg-sky-50 text-sky-800 border-sky-200",
                          !isCritical && !isHigh && !isMedium && "bg-slate-100 text-slate-700 border-slate-200"
                        )}
                      >
                        {isCritical ? "🔴" : isHigh ? "🟠" : isMedium ? "🟡" : "🟢"}{" "}
                        {finding.severity}
                      </span>
                      <span className="font-bold text-xs text-slate-900 font-sans">
                        {finding.finding_type}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {finding.asset_type}: {finding.asset}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-sans pl-1">
                      {finding.reason}
                    </p>

                    {finding.affected_source && (
                      <div className="text-[11px] font-mono text-slate-500 pl-1">
                        Source Attribution: <strong>{finding.affected_source}</strong>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:self-center">
                    <div className="text-right font-mono">
                      <div className="text-[10px] text-slate-400">Confidence</div>
                      <div className="text-xs font-bold text-slate-800">
                        {Math.round(finding.confidence * 100)}%
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (onSelectFinding) onSelectFinding(finding.finding_id);
                        if (onNavigateTab) onNavigateTab("evidence");
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-mono font-bold text-slate-800 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 text-sky-600" />
                      <span>VIEW EVIDENCE</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. RECOMMENDED ACTION (LEAD MLOPS ENGINEER DISPOSITION & AUDIT TRAIL) */}
      <div
        className={clsx(
          "rounded-2xl border p-6 sm:p-8 bg-white shadow-xs space-y-5 border-t-4",
          disposition === "QUARANTINE"
            ? "border-t-rose-600"
            : disposition === "REVIEW"
              ? "border-t-amber-500"
              : "border-t-emerald-500"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
              <Lock className="h-3.5 w-3.5 text-slate-600" />
              <span>RECOMMENDED ACTION (LEAD MLOPS ENGINEER SIGN-OFF)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 font-sans">
              System automated recommendation:{" "}
              <strong
                className={clsx(
                  disposition === "QUARANTINE"
                    ? "text-rose-600"
                    : disposition === "REVIEW"
                      ? "text-amber-600"
                      : "text-emerald-600"
                )}
              >
                {disposition}
              </strong>
              . Select official disposition to seal into tamper-evident SHA-256 audit ledger.
            </p>
          </div>

          <div className="font-mono text-xs text-slate-500">
            Active Disposition: <strong className="text-slate-900 font-bold">{disposition}</strong>
          </div>
        </div>

        {/* 3 Large Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* ACCEPT Button */}
          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleActionClick("ACCEPT")}
            className={clsx(
              "p-4 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
              disposition === "ACCEPT"
                ? "bg-emerald-50 border-2 border-emerald-500 shadow-xs"
                : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20"
            )}
          >
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <span className="font-mono text-sm font-bold text-slate-900">[ ACCEPT ]</span>
            <span className="text-[11px] text-slate-500 font-sans">
              CLEARED FOR GPU CLUSTER (SENTINEL SLA PASS)
            </span>
          </button>

          {/* REVIEW Button */}
          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleActionClick("REVIEW")}
            className={clsx(
              "p-4 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
              disposition === "REVIEW"
                ? "bg-amber-50 border-2 border-amber-500 shadow-xs"
                : "bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/20"
            )}
          >
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <span className="font-mono text-sm font-bold text-slate-900">[ REVIEW ]</span>
            <span className="text-[11px] text-slate-500 font-sans">
              FLAGGED FOR SECONDARY AUDIT
            </span>
          </button>

          {/* QUARANTINE Button */}
          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleActionClick("QUARANTINE")}
            className={clsx(
              "p-4 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
              disposition === "QUARANTINE"
                ? "bg-rose-50 border-2 border-rose-500 shadow-xs"
                : "bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50/20"
            )}
          >
            <Ban className="h-6 w-6 text-rose-600" />
            <span className="font-mono text-sm font-bold text-slate-900">[ QUARANTINE ]</span>
            <span className="text-[11px] text-slate-500 font-sans">
              TRAINING BLOCKED // CONTRACTOR PENALTY RECOMMENDED
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
