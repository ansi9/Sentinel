"use client";

import React from "react";
import clsx from "clsx";
import { ArrowLeft, AlertTriangle, Ban, Eye, CheckCircle2 } from "lucide-react";
import { FindingSchema } from "@/shared/types/assurance";

interface EvidenceInvestigationViewProps {
  finding: FindingSchema | null;
  onBack: () => void;
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-rose-50 border-rose-300 text-rose-600",
  HIGH: "bg-rose-50 border-rose-300 text-rose-600",
  MEDIUM: "bg-amber-50 border-amber-300 text-amber-700",
  LOW: "bg-slate-100 border-slate-300 text-slate-600",
};

const DISPOSITION_STYLE: Record<string, { badge: string; icon: React.ReactNode }> = {
  QUARANTINE: { badge: "bg-rose-50 border-rose-200 text-rose-600", icon: <Ban className="h-4 w-4" /> },
  REVIEW: { badge: "bg-sky-50 border-sky-200 text-sky-700", icon: <Eye className="h-4 w-4" /> },
  ACCEPT: { badge: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: <CheckCircle2 className="h-4 w-4" /> },
};

/** Renders one entry of a finding's `evidence` dict, which is a free-form
 * bag whatever detector raised the finding attached (numeric scores,
 * lists, nested objects) -- there is no fixed shape to build a bespoke
 * visualization against, so this renders the real key/value content
 * directly rather than inventing a canned "before/after image" mockup
 * that has no backing data for most finding types. */
function EvidenceValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">--</span>;
  }
  if (typeof value === "number") {
    return <span className="font-bold text-slate-900">{Number.isInteger(value) ? value : value.toFixed(4)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="font-bold text-slate-900">{value ? "true" : "false"}</span>;
  }
  if (typeof value === "string") {
    return <span className="text-slate-800">{value}</span>;
  }
  return (
    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap break-all bg-slate-50 rounded p-2 border border-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export const EvidenceInvestigationView: React.FC<EvidenceInvestigationViewProps> = ({
  finding,
  onBack,
}) => {
  if (!finding) {
    return (
      <div className="space-y-5 pb-12 font-sans">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-sky-600 text-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 stroke-[2.5]" />
          <span>Back</span>
        </button>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-bold text-slate-700">No finding selected.</p>
          <p className="text-xs text-slate-500 mt-1">Open a finding from the Findings Queue to investigate its evidence.</p>
        </div>
      </div>
    );
  }

  const confidencePct = Math.round(finding.confidence > 1 ? finding.confidence : finding.confidence * 100);
  const dispositionStyle = DISPOSITION_STYLE[finding.recommended_action] || DISPOSITION_STYLE.REVIEW;
  const evidenceEntries = Object.entries(finding.evidence || {});

  return (
    <div className="space-y-5 pb-12 font-sans">
      {/* Breadcrumb Trail */}
      <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
        <button onClick={onBack} className="hover:text-slate-900 transition-colors cursor-pointer">
          Assessment
        </button>
        <span>&gt;</span>
        <span className="text-slate-900 font-bold">{finding.finding_id}</span>
      </div>

      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-sky-600 text-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 stroke-[2.5]" />
            <span>{finding.finding_id}</span>
          </button>

          <span className={clsx("border font-mono text-xs px-2.5 py-0.5 rounded font-bold", SEVERITY_STYLE[finding.severity])}>
            ⚠ {finding.severity}
          </span>

          <span className="bg-sky-50 border border-sky-300 text-sky-700 font-mono text-xs px-2.5 py-0.5 rounded font-bold">
            {confidencePct}% CONFIDENCE
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
          <span>
            Asset: <strong className="text-slate-800">{finding.asset}</strong>
          </span>
          <span>•</span>
          <span>
            Type: <strong className="text-slate-800">{finding.asset_type}</strong>
          </span>
        </div>
      </div>

      {/* Two Main Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Finding Details */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4 flex flex-col justify-between min-h-[300px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-wider">
                FINDING DETAILS
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {finding.finding_type}
            </h2>

            <p className="text-xs text-slate-600 leading-relaxed">
              {finding.reason}
            </p>
          </div>

          {/* Structured Metadata Rows */}
          <div className="border-t border-slate-100 pt-3 space-y-2.5 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-400 font-medium">Asset</span>
              <span className="text-slate-800 font-bold">{finding.asset}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-400 font-medium">Asset Type</span>
              <span className="text-slate-800 font-bold">{finding.asset_type}</span>
            </div>
            {finding.affected_source && (
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Affected Source</span>
                <span className="text-slate-800 font-bold">{finding.affected_source}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400 font-medium uppercase text-[11px]">
                RECOMMENDED DISPOSITION
              </span>
              <span className={clsx("border font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1", dispositionStyle.badge)}>
                {dispositionStyle.icon}
                {finding.recommended_action}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Raw Evidence */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-wider">
              RAW EVIDENCE
            </span>
          </div>

          {evidenceEntries.length === 0 ? (
            <p className="text-xs text-slate-500">
              This finding was raised without a structured evidence payload -- see the reason above for the full detection rationale.
            </p>
          ) : (
            <div className="space-y-2 text-xs font-mono">
              {evidenceEntries.map(([key, value]) => (
                <div key={key} className="py-1.5 border-b border-slate-50 flex items-start justify-between gap-4">
                  <span className="text-slate-400 font-medium shrink-0">{key}</span>
                  <div className="text-right"><EvidenceValue value={value} /></div>
                </div>
              ))}
            </div>
          )}

          {(finding.limitations.length > 0 || finding.access_assumptions.length > 0) && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              {finding.limitations.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Limitations
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {finding.limitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {finding.access_assumptions.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Access Assumptions
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {finding.access_assumptions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
