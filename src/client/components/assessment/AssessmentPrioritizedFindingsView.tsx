"use client";

import React, { useState } from "react";
import clsx from "clsx";
import {
  ArrowUpDown,
  ArrowRight,
  AlertTriangle,
  Clock,
  Layers,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { FindingSchema } from "@/shared/types/assurance";

interface AssessmentPrioritizedFindingsViewProps {
  reportId?: string;
  findings?: FindingSchema[];
  onInvestigateFinding?: (findingId: string) => void;
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

export const AssessmentPrioritizedFindingsView: React.FC<
  AssessmentPrioritizedFindingsViewProps
> = ({ reportId, findings, onInvestigateFinding }) => {
  const [sortAsc, setSortAsc] = useState(false);

  const displayFindings = (findings || [])
    .map((f, i) => ({
      key: `${reportId || "rep"}_${f.finding_id || "fid"}_${i}`,
      id: f.finding_id || `F-${String(i + 1).padStart(3, "0")}`,
      code: f.finding_id || `F-${String(i + 1).padStart(3, "0")}`,
      severity: f.severity,
      title: f.finding_type,
      description: f.reason,
      confidence: Math.round(f.confidence > 1 ? f.confidence : f.confidence * 100),
      layer: `${f.asset_type}: ${f.asset}`,
    }))
    .sort((a, b) =>
      sortAsc
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        : SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    );

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {reportId && (
              <span className="font-mono text-xs text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium">
                {reportId}
              </span>
            )}
            <span className="font-mono text-xs text-slate-500 font-medium">
              {displayFindings.length} finding{displayFindings.length === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Prioritized Findings
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSortAsc((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
            <span>Sort: Severity {sortAsc ? "(Low→High)" : "(High→Low)"}</span>
          </button>
        </div>
      </div>

      {displayFindings.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-8 sm:p-10 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900">
              Clean Assessment • 0 Vulnerabilities Detected
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              This asset successfully passed all evaluation batteries (weight distribution, backdoor trigger search, label anomalies, and cryptographic signatures). No compromise was detected.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-xs font-mono font-bold shadow-2xs">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>DISPOSITION: ACCEPT (TRUSTED AIR-GAP ASSET)</span>
          </div>

          <div className="pt-4 border-t border-emerald-200/60 max-w-lg mx-auto">
            <p className="text-[11px] text-slate-500 font-sans mb-3">
              To inspect findings from simulated adversarial attacks, switch to a compromised scenario or report from the switcher:
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700">
                Scenario B (Data Poisoning)
              </span>
              <span className="px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700">
                Scenario C (Backdoored Model)
              </span>
              <span className="px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700">
                Scenario D (Inference Tampering)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3 Column Findings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {displayFindings.slice(0, 6).map((f) => {
          const isCritical = f.severity === "CRITICAL";
          const isHigh = f.severity === "HIGH";

          return (
            <div
              key={f.key}
              className={clsx(
                "border rounded-xl bg-white p-5 shadow-xs flex flex-col justify-between space-y-4",
                isCritical
                  ? "border-rose-300 border-l-4 border-l-rose-600"
                  : isHigh
                    ? "border-slate-200/90 border-l-4 border-l-sky-600"
                    : "border-slate-200/90"
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">
                    {isCritical ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    ) : isHigh ? (
                      <Layers className="h-3.5 w-3.5 text-sky-600" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className={clsx(isCritical && "text-rose-600")}>
                      {f.code}
                    </span>
                  </div>
                  <span
                    className={clsx(
                      "font-mono text-xs font-bold px-2 py-0.5 rounded uppercase",
                      isCritical
                        ? "bg-[#e11d48] text-white"
                        : isHigh
                          ? "bg-sky-100 border border-sky-300 text-sky-800"
                          : "bg-slate-100 border border-slate-200 text-slate-700"
                    )}
                  >
                    {f.severity}
                  </span>
                </div>

                <h2 className="text-lg font-bold text-slate-900 tracking-tight break-words">
                  {f.title}
                </h2>

                {/* Confidence Score Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-slate-500">Confidence Score</span>
                    <span className="font-bold text-slate-900">
                      {f.confidence}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-1.5 rounded-full",
                        isCritical
                          ? "bg-[#e11d48]"
                          : isHigh
                            ? "bg-sky-600"
                            : "bg-slate-500"
                      )}
                      style={{ width: `${f.confidence}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-sans pt-1 break-words">
                  {f.description}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between font-mono text-xs">
                <div className="text-slate-500">
                  <span className="text-slate-400 block text-[10px]">Layer:</span>
                  <span className="text-slate-700 font-medium">{f.layer}</span>
                </div>
                <button
                  onClick={() =>
                    onInvestigateFinding && onInvestigateFinding(f.id)
                  }
                  className={clsx(
                    "flex items-center gap-1 px-3.5 py-1.5 rounded-md font-mono text-xs font-bold transition-colors shadow-2xs cursor-pointer",
                    isCritical
                      ? "bg-black hover:bg-slate-800 text-white"
                      : "border border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                  )}
                >
                  <span>Investigate</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
