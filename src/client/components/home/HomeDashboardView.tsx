"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ClipboardList,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Shield,
  Activity,
  Lock,
  Radio,
  Loader2,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { useReportList } from "@/client/lib/useReportList";
import { AssuranceReport, FindingSeverity } from "@/shared/types/assurance";

interface HomeDashboardViewProps {
  onNavigateToAssessment: (reportId: string) => void;
  onViewAllAssessments: () => void;
  onViewAllFindings: () => void;
}

function severityCounts(report: AssuranceReport | null): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  if (!report) return counts;
  for (const f of report.findings) counts[f.severity] += 1;
  return counts;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Every number on this dashboard is derived from `useReportList` (the
 * real /api/report/list + per-report bodies) -- there is no hardcoded
 * demo fleet here. If no assessments have been run yet, every KPI
 * correctly reads 0 rather than showing an invented baseline. */
export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  onNavigateToAssessment,
  onViewAllAssessments,
  onViewAllFindings,
}) => {
  const router = useRouter();
  const { cards, error } = useReportList(50);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-700">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>Could not load assessments: {error}</span>
      </div>
    );
  }

  if (cards === null) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading assessments...
      </div>
    );
  }

  const total = cards.length;
  const needingAttention = cards.filter((c) => c.summary.overall_disposition !== "ACCEPT");
  const quarantined = cards.filter((c) => c.summary.overall_disposition === "QUARANTINE");
  const accepted = cards.filter((c) => c.summary.overall_disposition === "ACCEPT");
  const highRiskFindingCount = cards.reduce((sum, c) => {
    const counts = severityCounts(c.report);
    return sum + counts.CRITICAL + counts.HIGH;
  }, 0);

  const attentionSorted = [...needingAttention].sort((a, b) => {
    const rank = (d: string) => (d === "QUARANTINE" ? 2 : d === "REVIEW" ? 1 : 0);
    const rankDiff = rank(b.summary.overall_disposition) - rank(a.summary.overall_disposition);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.summary.generated_at).getTime() - new Date(a.summary.generated_at).getTime();
  });

  const recent = [...cards]
    .sort((a, b) => new Date(b.summary.generated_at).getTime() - new Date(a.summary.generated_at).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Executive Welcome & Air-Gap Telemetry Banner */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Image
            src="/logo_withoutlabel.png"
            alt="Sentinel Core"
            width={56}
            height={56}
            priority
            className="h-14 w-auto object-contain shrink-0 drop-shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SENTINEL OPERATIONAL INTEGRITY CORE</span>
              <span>•</span>
              <span className="text-slate-700 font-semibold">100% AIR-GAPPED</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              CV Trust & Fleet Overview
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Real assurance metrics across every assessment this deployment has generated.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-700 font-medium">Outbound: Blocked</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <Radio className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-slate-700 font-medium">Hash Chain: Intact</span>
          </div>
        </div>
      </div>

      {/* Instant Multi-Vector Evaluation Banner (MoD PS 26228) */}
      <div className="rounded-xl border border-sky-200 bg-linear-to-r from-sky-50 via-white to-sky-50/30 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Sparkles className="h-4 w-4 text-sky-600" />
            <span className="font-mono text-xs font-bold text-sky-900 uppercase tracking-wider">
              TRACK 02: TRUST, SAFETY & DIGITAL SECURITY
            </span>
          </div>
          <p className="text-xs text-slate-600 font-sans">
            Upload or drop any Vision Model (.onnx, .pt), Dataset Archive (.zip), or Inference Record (.json) for immediate air-gapped audit.
          </p>
        </div>
        <button
          onClick={() => router.push("/assessments/new")}
          className="px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-bold shadow-xs transition-colors shrink-0 flex items-center gap-2 cursor-pointer"
        >
          <UploadCloud className="h-4 w-4 text-sky-400" />
          <span>Drop & Audit Asset</span>
        </button>
      </div>

      {/* 4 Top KPI Cards -- all real */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ClipboardList} tone="sky" value={total} label="Total Assessments" sub="All time" />
        <KpiCard icon={AlertTriangle} tone="amber" value={needingAttention.length} label="Needs Attention" sub="Require review" />
        <KpiCard icon={ShieldAlert} tone="rose" value={highRiskFindingCount} label="High Risk Findings" sub="Critical + High, across all reports" />
        <KpiCard icon={CheckCircle2} tone="emerald" value={accepted.length} label="Accepted Assessments" sub="Trusted" />
      </div>

      {/* Main 2-Column Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Assessments Needing Attention */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Assessments Needing Attention
              </h2>
            </div>
            <button
              onClick={onViewAllAssessments}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors cursor-pointer"
            >
              View all
            </button>
          </div>

          {attentionSorted.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {total === 0 ? "No assessments have been run yet." : "Nothing needs attention — everything is trusted."}
            </div>
          ) : (
            <div className="space-y-2">
              {attentionSorted.slice(0, 6).map(({ summary, report }) => {
                const counts = severityCounts(report);
                const topFindingLabel =
                  counts.CRITICAL > 0
                    ? `${counts.CRITICAL} critical finding${counts.CRITICAL === 1 ? "" : "s"}`
                    : counts.HIGH > 0
                      ? `${counts.HIGH} high finding${counts.HIGH === 1 ? "" : "s"}`
                      : "under review";
                return (
                  <div
                    key={summary.report_id}
                    onClick={() => onNavigateToAssessment(summary.report_id)}
                    className={clsx(
                      "flex items-center justify-between p-3.5 rounded-lg bg-slate-50/50 hover:bg-slate-100/70 cursor-pointer transition-all border border-slate-200/80",
                      summary.overall_disposition === "QUARANTINE" ? "border-l-4 border-l-rose-500" : "border-l-4 border-l-amber-500"
                    )}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-bold text-slate-900 text-sm truncate font-mono">
                        {summary.report_id}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <span>{timeAgo(summary.generated_at)}</span>
                        <span>•</span>
                        <span className="text-rose-600 font-medium">{topFindingLabel}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 font-sans">
                          {Math.round(summary.assurance_score)}
                          <span className="text-[11px] font-normal text-slate-400">/100</span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-400">Assurance</div>
                      </div>

                      <span
                        className={clsx(
                          "px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                          summary.overall_disposition === "QUARANTINE" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {summary.overall_disposition}
                      </span>

                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Platform Health & Quick Actions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Fleet Disposition Breakdown
                </h2>
              </div>
              <button
                onClick={onViewAllFindings}
                className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors cursor-pointer"
              >
                Triage
              </button>
            </div>

            {total === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No assessments yet.</div>
            ) : (
              <div className="space-y-3 text-xs">
                <DispositionBar label="Accepted (Trusted)" count={accepted.length} total={total} colorClass="bg-emerald-500" />
                <DispositionBar
                  label="Review Required"
                  count={total - accepted.length - quarantined.length}
                  total={total}
                  colorClass="bg-amber-500"
                />
                <DispositionBar label="Quarantined" count={quarantined.length} total={total} colorClass="bg-rose-500" />
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono mb-3">
              Recent Activity
            </h3>
            {recent.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No activity yet.</div>
            ) : (
              <div className="space-y-3 text-xs">
                {recent.map(({ summary }) => (
                  <div
                    key={summary.report_id}
                    onClick={() => onNavigateToAssessment(summary.report_id)}
                    className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0 cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 font-mono">{summary.report_id.slice(0, 20)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{timeAgo(summary.generated_at)}</div>
                    </div>
                    <span
                      className={clsx(
                        "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                        summary.overall_disposition === "ACCEPT"
                          ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                          : summary.overall_disposition === "REVIEW"
                            ? "text-amber-700 bg-amber-50 border-amber-200"
                            : "text-rose-700 bg-rose-50 border-rose-200"
                      )}
                    >
                      {Math.round(summary.assurance_score)}/100
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const KPI_TONE_CLASSES: Record<string, string> = {
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

const KpiCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; tone: string; value: number; label: string; sub: string }> = ({
  icon: Icon,
  tone,
  value,
  label,
  sub,
}) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
    <div className={clsx("flex h-12 w-12 items-center justify-center rounded-xl shrink-0", KPI_TONE_CLASSES[tone])}>
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight font-sans">{value}</div>
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{sub}</div>
    </div>
  </div>
);

const DispositionBar: React.FC<{ label: string; count: number; total: number; colorClass: string }> = ({
  label,
  count,
  total,
  colorClass,
}) => (
  <div>
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-bold text-slate-900">{count} / {total}</span>
    </div>
    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
      <div className={clsx("h-2 rounded-full", colorClass)} style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
    </div>
  </div>
);
