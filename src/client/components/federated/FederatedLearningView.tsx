"use client";

import React, { useState } from "react";
import clsx from "clsx";
import {
  Network,
  ShieldAlert,
  ShieldCheck,
  Play,
  KeyRound,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  Lock,
  Layers,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { FederatedSimulationResult, BranchDecision } from "@/shared/types/assurance";

const AVAILABLE_BRANCHES = [
  { id: "army", label: "Army" },
  { id: "navy", label: "Navy" },
  { id: "airforce", label: "Air Force" },
] as const;

const KPI_TONE_CLASSES = {
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof KPI_TONE_CLASSES;
  value: string | number;
  label: string;
  sub: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  tone,
  value,
  label,
  sub,
}) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
    <div
      className={clsx(
        "flex h-12 w-12 items-center justify-center rounded-xl shrink-0",
        KPI_TONE_CLASSES[tone]
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold text-slate-900 tracking-tight font-sans truncate">
        {value}
      </div>
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
        {sub}
      </div>
    </div>
  </div>
);

function formatBranchLabel(id: string): string {
  const match = AVAILABLE_BRANCHES.find((b) => b.id === id);
  return match ? match.label : id.toUpperCase();
}

function formatExclusionReason(decision: BranchDecision): string {
  if (decision.reason.includes("outlier")) {
    if (decision.robust_z_score != null) {
      return `Statistical outlier (Z-Score: ${decision.robust_z_score.toFixed(1)})`;
    }
    return "Statistical outlier (gradient deviation)";
  }
  return decision.reason.replace(/_/g, " ");
}

export const FederatedLearningView: React.FC = () => {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([
    "army",
    "navy",
  ]);
  const [maliciousBranches, setMaliciousBranches] = useState<string[]>([]);
  const [numRounds, setNumRounds] = useState(5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FederatedSimulationResult | null>(null);
  const [copiedDigest, setCopiedDigest] = useState<string | null>(null);

  const toggleBranch = (
    list: string[],
    setList: (v: string[]) => void,
    branch: string
  ) => {
    setList(
      list.includes(branch)
        ? list.filter((b) => b !== branch)
        : [...list, branch]
    );
  };

  const runSimulation = async () => {
    if (selectedBranches.length < 2) {
      setError("Select at least two participating branches to federate.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await AssuranceApiClient.runFederatedSimulation({
        branchIds: selectedBranches,
        numRounds,
        maliciousBranchIds: maliciousBranches.filter((b) =>
          selectedBranches.includes(b)
        ),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleCopyDigest = (digest: string) => {
    navigator.clipboard.writeText(digest);
    setCopiedDigest(digest);
    setTimeout(() => setCopiedDigest(null), 2000);
  };

  const totalExclusions =
    result?.rounds.reduce((sum, r) => sum + r.excluded_branches.length, 0) ?? 0;

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>CROSS-BRANCH FEDERATION</span>
            <span>•</span>
            <span className="text-slate-700 font-semibold">BYZANTINE-ROBUST</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Secure Federated Learning
          </h1>
          <p className="text-xs text-slate-500">
            Decentralized model training with Ed25519 authenticated updates and outlier gradient screening.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <Lock className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-700 font-medium">Raw Data: Kept Local</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <KeyRound className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-slate-700 font-medium">Ed25519 Signed</span>
          </div>
        </div>
      </div>

      {/* Federation Setup Panel */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Federation Configuration
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Air-Gapped Node Orchestration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Participating Branches */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Participating Branches
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                Min. 2 required
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {AVAILABLE_BRANCHES.map(({ id, label }) => {
                const active = selectedBranches.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      toggleBranch(selectedBranches, setSelectedBranches, id)
                    }
                    className={clsx(
                      "flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer",
                      active
                        ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        active ? "bg-emerald-400" : "bg-slate-300"
                      )}
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Adversarial Simulation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Simulate Compromised Node
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                Optional
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedBranches.map((id) => {
                const active = maliciousBranches.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      toggleBranch(maliciousBranches, setMaliciousBranches, id)
                    }
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer",
                      active
                        ? "bg-rose-50 border-rose-300 text-rose-700 shadow-2xs font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    <ShieldAlert
                      className={clsx(
                        "h-3.5 w-3.5",
                        active ? "text-rose-600" : "text-slate-400"
                      )}
                    />
                    <span>{formatBranchLabel(id)}</span>
                    {active && <span className="text-[10px] text-rose-500">(Poisoned)</span>}
                  </button>
                );
              })}
              {selectedBranches.length === 0 && (
                <span className="text-xs text-slate-400 py-1.5">
                  Select participating branches first.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">
              Aggregation Rounds:
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={numRounds}
              onChange={(e) =>
                setNumRounds(
                  Math.max(1, Math.min(20, Number(e.target.value) || 1))
                )
              }
              className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
            />
            <span className="text-[11px] text-slate-400 font-mono">
              (1 - 20)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {result && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={runSimulation}
              disabled={running || selectedBranches.length < 2}
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Aggregating Updates...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Run Federated Simulation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-700 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results or Idle State */}
      {result ? (
        <div className="space-y-6">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={KeyRound}
              tone="sky"
              value={`${result.branch_ids.length} Nodes`}
              label="Enrolled Branches"
              sub={result.branch_ids.map(formatBranchLabel).join(", ")}
            />
            <MetricCard
              icon={Layers}
              tone="indigo"
              value={`${result.rounds.length} Rounds`}
              label="Rounds Executed"
              sub="Secure weight delta sync"
            />
            <MetricCard
              icon={ShieldCheck}
              tone="emerald"
              value={
                result.final_eval_accuracy != null
                  ? `${(result.final_eval_accuracy * 100).toFixed(1)}%`
                  : "N/A"
              }
              label="Global Accuracy"
              sub="Post-aggregation holdout"
            />
            <MetricCard
              icon={ShieldAlert}
              tone={totalExclusions > 0 ? "rose" : "emerald"}
              value={totalExclusions}
              label="Byzantine Exclusions"
              sub={
                totalExclusions > 0
                  ? "Poisoned updates rejected"
                  : "All contributions verified"
              }
            />
          </div>

          {/* Aggregation Table */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Round-by-Round Aggregation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verification status and outlier filtering per training round.
                </p>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                Ledger Synced
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-6">Round</th>
                    <th className="py-3 px-6">Accepted Branches</th>
                    <th className="py-3 px-6">Excluded Branches</th>
                    <th className="py-3 px-6">Global Accuracy</th>
                    <th className="py-3 px-6 text-right">Aggregate Digest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rounds.map((round) => (
                    <tr
                      key={round.round_id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3 px-6 font-mono font-bold text-slate-900">
                        #{round.round_id}
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex gap-1.5 flex-wrap">
                          {round.accepted_branches.map((b) => (
                            <span
                              key={b}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {formatBranchLabel(b)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        {round.excluded_branches.length === 0 ? (
                          <span className="text-slate-400 font-mono text-[11px]">
                            None
                          </span>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {round.excluded_branches.map((d) => (
                              <span
                                key={d.branch_id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium bg-rose-50 text-rose-700 border border-rose-200"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                <span className="font-bold">
                                  {formatBranchLabel(d.branch_id)}
                                </span>
                                <span className="text-[10px] text-rose-600 font-sans font-normal">
                                  ({formatExclusionReason(d)})
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-6 font-mono font-bold text-slate-900">
                        {round.global_eval_accuracy != null
                          ? `${(round.global_eval_accuracy * 100).toFixed(1)}%`
                          : "N/A"}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleCopyDigest(round.aggregate_digest)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono text-[11px] transition-colors cursor-pointer"
                          title="Copy full digest hash"
                        >
                          {copiedDigest === round.aggregate_digest ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-700 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 text-slate-400" />
                              <span>{round.aggregate_digest.slice(0, 12)}...</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Ready State */
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <Network className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Ready for Federated Simulation
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Select participating branch nodes above and initiate training to evaluate Byzantine robustness, outlier screening, and global accuracy convergence.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
