"use client";

import React from "react";
import {
  Search,
  Download,
} from "lucide-react";
import clsx from "clsx";
import { OperatorProfile } from "@/client/components/auth/AuthStationLogin";
import { AssuranceApiClient } from "@/client/lib/api-client";

export type ExplorerSecondaryTab =
  | "overview"
  | "assets"
  | "findings"
  | "evidence"
  | "decision";

interface AppTopNavProps {
  title?: string;
  assessmentId?: string;
  operator?: OperatorProfile | null;
  activeSecondaryTab?: ExplorerSecondaryTab;
  onSecondaryTabChange?: (tab: ExplorerSecondaryTab) => void;
  showSecondaryTabs?: boolean;
  searchPlaceholder?: string;
  shortcutKey?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const AppTopNav: React.FC<AppTopNavProps> = ({
  assessmentId,
  operator,
  activeSecondaryTab = "overview",
  onSecondaryTabChange,
  showSecondaryTabs = false,
  searchPlaceholder = "Search findings, models, IDs...",
  shortcutKey = "⌘K",
}) => {
  const secondaryTabs = [
    { key: "overview" as const, label: "OVERVIEW" },
    { key: "assets" as const, label: "ASSETS" },
    { key: "findings" as const, label: "FINDINGS" },
    { key: "evidence" as const, label: "EVIDENCE" },
    { key: "decision" as const, label: "DECISION" },
  ];

  return (
    <header
      className="h-16 px-8 flex items-center justify-between border-b border-slate-200/80 bg-white sticky top-0 z-10 shrink-0 font-sans select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-8" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {showSecondaryTabs && onSecondaryTabChange ? (
          <div className="flex items-center gap-8">
            <div className="shrink-0">
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                Assessment Explorer
              </h1>
              {assessmentId && (
                <div className="font-mono text-[10px] text-slate-400 font-medium tracking-wide">
                  {assessmentId}
                </div>
              )}
            </div>

            <nav className="flex items-center gap-6 text-xs font-mono font-bold">
              {secondaryTabs.map((tab) => {
                const isActive = activeSecondaryTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => onSecondaryTabChange(tab.key)}
                    className={clsx(
                      "py-5 transition-all relative cursor-pointer tracking-wider",
                      isActive
                        ? "text-slate-950 font-bold"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-950" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : (
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-80 sm:w-96 bg-slate-100/90 border border-slate-200/80 text-xs text-slate-800 placeholder-slate-400 pl-8.5 pr-8 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-all font-mono"
            />
            {shortcutKey && (
              <span className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1 py-0.5 rounded shadow-2xs">
                {shortcutKey}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-mono text-emerald-800 font-semibold tracking-wider uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          DESKTOP WORKSTATION
        </div>

        {showSecondaryTabs && (
          <div className="relative mr-2">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-44 bg-slate-100/90 border border-slate-200/80 text-xs text-slate-800 placeholder-slate-400 pl-8.5 pr-3 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-all font-mono"
            />
          </div>
        )}

        {assessmentId && (
          <a
            href={AssuranceApiClient.reportExportUrl(assessmentId, "html")}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Download this assessment's report (HTML)"
          >
            <Download className="h-4 w-4" />
          </a>
        )}

        {/* User profile avatar -- real operator initials, when signed in */}
        {operator && (
          <div
            className="h-7 w-7 rounded-full bg-slate-900 text-white font-mono font-bold text-[10px] flex items-center justify-center ml-1 ring-1 ring-slate-200 shadow-xs"
            title={operator.name}
          >
            {initialsOf(operator.name)}
          </div>
        )}
      </div>
    </header>
  );
};
