"use client";

import React, { useMemo, useState } from "react";
import {
  Shield,
  Copy,
  Filter,
  Download,
  RotateCw,
  Cpu,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { AuditLogEntry } from "@/shared/types/assurance";

interface AuditLedgerViewProps {
  entries?: AuditLogEntry[];
  chainDigest?: string;
  isChainValid?: boolean | null;
  verificationErrors?: string[];
  onRefresh?: () => void;
}

const PAGE_SIZE = 25;

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({
  entries,
  chainDigest,
  isChainValid,
  verificationErrors,
  onRefresh,
}) => {
  const [copied, setCopied] = useState(false);
  const [eventFilter, setEventFilter] = useState("ALL");
  const [page, setPage] = useState(0);

  const list = useMemo(() => entries || [], [entries]);

  const eventTypes = useMemo(
    () => Array.from(new Set(list.map((e) => e.event))).sort(),
    [list]
  );

  const filtered = useMemo(
    () => (eventFilter === "ALL" ? list : list.filter((e) => e.event === eventFilter)),
    [list, eventFilter]
  );

  // Newest first for display -- the ledger itself is append-only in
  // ascending sequence_id order, but an analyst wants the most recent
  // activity at the top.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.sequence_id - a.sequence_id),
    [filtered]
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  const latestEntry = list.length > 0 ? list[list.length - 1] : null;
  const displayDigest = chainDigest || latestEntry?.entry_hash || null;
  const lastEntryTimestamp = latestEntry?.timestamp || null;

  const copyHash = () => {
    if (!displayDigest) return;
    navigator.clipboard.writeText(displayDigest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCsv = () => {
    const header = [
      "sequence_id", "timestamp", "event", "asset_id", "operation",
      "input_digest", "result", "evidence_reference", "previous_entry_hash", "entry_hash",
    ];
    const rows = sorted.map((e) => [
      e.sequence_id, e.timestamp, e.event, e.asset_id, e.operation,
      e.input_digest, e.result, e.evidence_reference, e.previous_entry_hash, e.entry_hash,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_ledger_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Banner: Real chain-integrity status from /api/audit/entries */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs border ${
              isChainValid === false
                ? "bg-rose-50 border-rose-200 text-rose-600"
                : "bg-sky-50 border-sky-200 text-sky-600"
            }`}
          >
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 tracking-tight">
              Audit Integrity:{" "}
              <span className={isChainValid === false ? "text-rose-600" : "text-[#0284c7]"}>
                {isChainValid === null || isChainValid === undefined
                  ? "UNKNOWN"
                  : isChainValid
                    ? "VERIFIED"
                    : "INTEGRITY FAILURE"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mt-0.5">
              <span>CHAIN HASH:</span>
              {displayDigest ? (
                <>
                  <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {displayDigest.substring(0, 16)}...
                  </span>
                  <button
                    onClick={copyHash}
                    className="hover:text-slate-900 transition-colors cursor-pointer"
                    title="Copy Hash"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600 inline" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 inline" />
                    )}
                  </button>
                </>
              ) : (
                <span className="text-slate-400">No entries yet</span>
              )}
            </div>
          </div>
        </div>

        <div className="text-left md:text-right font-mono text-xs">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
            LAST ENTRY
          </div>
          <div className="text-slate-700 font-medium mt-0.5">
            {lastEntryTimestamp ? lastEntryTimestamp.replace("T", " ").replace("Z", " UTC") : "--"}
          </div>
        </div>
      </div>

      {isChainValid === false && verificationErrors && verificationErrors.length > 0 && (
        <div className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-xs text-rose-700 font-mono space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>Ledger Tampering Detected:</span>
          </div>
          {verificationErrors.map((err, i) => (
            <div key={i}>• {err}</div>
          ))}
        </div>
      )}

      {/* Filter & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex items-center bg-white border border-slate-300 rounded-md px-3 py-1.5 shadow-2xs">
            <Filter className="h-3.5 w-3.5 text-slate-400 mr-2" />
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setPage(0);
              }}
              className="bg-transparent text-slate-800 text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-mono text-xs font-medium transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-black hover:bg-slate-800 text-white font-mono text-xs font-bold transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Refresh Logs</span>
          </button>
        </div>
      </div>

      {/* Immutable Event Ledger Table Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-900 tracking-tight font-sans">
            Immutable Event Ledger
          </h2>
          <span className="font-mono text-xs text-slate-400">
            Showing {sorted.length === 0 ? 0 : pageSafe * PAGE_SIZE + 1}-
            {Math.min(sorted.length, pageSafe * PAGE_SIZE + PAGE_SIZE)} of {sorted.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-slate-100 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="py-3 px-5">SEQ</th>
                <th className="py-3 px-5">TIMESTAMP (UTC)</th>
                <th className="py-3 px-5">EVENT</th>
                <th className="py-3 px-5">ASSET / OPERATION</th>
                <th className="py-3 px-5">RESULT</th>
                <th className="py-3 px-5">EVIDENCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((evt) => (
                <tr key={evt.sequence_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-5 font-mono text-slate-400 text-xs">
                    #{evt.sequence_id}
                  </td>
                  <td className="py-3.5 px-5 font-mono text-slate-500 text-xs whitespace-nowrap">
                    {evt.timestamp.replace("T", " ").replace("Z", "")}
                  </td>
                  <td className="py-3.5 px-5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {evt.event.includes("VERIFICATION") ? (
                        <Shield className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      )}
                      <span
                        className={
                          evt.result.includes("TAMPER") || evt.result.includes("FAIL")
                            ? "text-[#e11d48] font-bold font-mono"
                            : "text-slate-800 font-medium"
                        }
                      >
                        {evt.event}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-slate-600 font-mono text-[11px]">
                    <div className="text-slate-800 font-medium">{evt.operation}</div>
                    <div className="text-slate-400 mt-0.5">{evt.asset_id}</div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        evt.result.includes("TAMPER") || evt.result.includes("FAIL")
                          ? "bg-rose-50 border border-rose-300 text-rose-600"
                          : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      }`}
                    >
                      {evt.result}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-slate-600 max-w-xs truncate" title={evt.evidence_reference}>
                    {evt.evidence_reference || "--"}
                  </td>
                </tr>
              ))}

              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 font-mono text-xs">
                    No audit events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Pagination */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>Page {pageSafe + 1} of {pageCount}</span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={pageSafe === 0}
              className="p-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageSafe >= pageCount - 1}
              className="p-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
