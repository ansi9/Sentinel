"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import {
  ShieldCheck,
  Skull,
  Cpu,
  AlertOctagon,
  Play,
  Repeat,
  FileWarning,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { StatusBadge } from "../ui/StatusBadge";

interface ScenarioSelectorProps {
  activeScenario: string;
  loading: boolean;
  onSelectScenario: (scenarioId: string) => void;
}

interface ScenarioSummary {
  id: string;
  name: string;
  badge: string;
  disposition: string;
  description: string;
}

const SCENARIO_PRESENTATION: Record<
  string,
  { icon: typeof ShieldCheck; tone: string }
> = {
  A: { icon: ShieldCheck, tone: "emerald" },
  B: { icon: Skull, tone: "rose" },
  C: { icon: Cpu, tone: "amber" },
  D: { icon: AlertOctagon, tone: "rose" },
  E: { icon: Repeat, tone: "rose" },
  F: { icon: FileWarning, tone: "amber" },
};

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  activeScenario,
  loading,
  onSelectScenario,
}) => {
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    AssuranceApiClient.listScenarios()
      .then((data) => {
        if (isMounted) setScenarios(data);
      })
      .catch((e) => {
        if (isMounted) setFetchError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            <h2 className="text-xs font-mono font-bold tracking-wider text-slate-800 uppercase">
              Controlled Assurance Tests — Red-Team Validation Laboratory
            </h2>
            <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
              SYNTHETIC TEST BENCH
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-sans">
            Evaluate engine detection capabilities using reproducible attack vectors and baseline models (separate from operational assessments).
          </p>
        </div>
      </div>

      {fetchError ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 font-mono">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-rose-600" />
          <span>Could not load the scenario list: {fetchError}</span>
        </div>
      ) : scenarios === null ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 font-mono">
          <Loader2 className="h-4 w-4 animate-spin text-sky-600" /> Loading scenario matrix...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mt-4">
          {scenarios.map((sc) => {
            const presentation = SCENARIO_PRESENTATION[sc.id] || {
              icon: ShieldCheck,
              tone: "zinc",
            };
            const Icon = presentation.icon;
            const isSelected = activeScenario === sc.id;

            return (
              <button
                key={sc.id}
                onClick={() => onSelectScenario(sc.id)}
                disabled={loading}
                className={clsx(
                  "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer",
                  isSelected
                    ? "border-sky-500 bg-sky-50/40 shadow-xs ring-1 ring-sky-500"
                    : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/70",
                  loading && "opacity-60 cursor-not-allowed"
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className={clsx(
                        "flex h-7 w-7 items-center justify-center rounded-md",
                        isSelected
                          ? "bg-sky-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <StatusBadge status={sc.disposition} size="sm" />
                  </div>

                  <div className="mt-2.5">
                    <div className="text-xs font-bold text-slate-900 font-sans leading-tight">
                      {sc.name}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed font-sans">
                      {sc.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-mono">
                  <span className="text-slate-400 font-medium">VECTOR {sc.id}</span>
                  <span
                    className={clsx(
                      "flex items-center gap-1 font-bold",
                      isSelected
                        ? "text-sky-600"
                        : "text-slate-600 group-hover:text-slate-900"
                    )}
                  >
                    <Play className="h-2.5 w-2.5" />
                    {isSelected ? "ACTIVE" : "RUN"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
