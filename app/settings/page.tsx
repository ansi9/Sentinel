"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { operatorAtom } from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { Lock, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";

export default function SettingsPage() {
  const router = useRouter();
  const [operator] = useAtom(operatorAtom);
  const setOperator = useSetAtom(operatorAtom);

  const [chainVerification, setChainVerification] = useState<{
    is_chain_valid: boolean;
    errors: string[];
  } | null>(null);

  const handleSwitchOperator = () => {
    setOperator(null);
    router.push("/login");
  };

  return (
    <WorkspaceShell
      title="System Settings & Security"
      activeNav="settings"
      searchPlaceholder="Search system parameters..."
      shortcutKey="⌘K"
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6 font-sans">
        <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              System & Air-Gap Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              Platform deployment parameters, cryptographic keys, and station operator session.
            </p>
          </div>
          <button
            onClick={handleSwitchOperator}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-mono font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Switch Station Operator
          </button>
        </div>

        {operator && (
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900">{operator.name}</div>
              <div className="text-[11px] font-mono text-slate-500">
                Operating Role: {operator.role ? operator.role.toUpperCase() : "AIR-GAP OPERATOR"}
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              SESSION ACTIVE
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Lock className="h-4 w-4 text-emerald-600" />
              <span>Air-Gap Network Isolation</span>
            </div>
            <p className="text-slate-600 text-[11px] font-sans">
              Strict localhost-only binding. Zero telemetry or external cloud outbound transmission.
            </p>
            <div className="text-[11px] text-emerald-600 font-bold font-mono">
              ✓ ENFORCED (Status: ACTIVE)
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Cpu className="h-4 w-4 text-sky-600" />
              <span>Evaluation Core</span>
            </div>
            <p className="text-slate-600 text-[11px] font-sans">
              Local ONNX Runtime & PyTorch inference engine.
            </p>
            <div className="text-[11px] text-slate-800 font-mono">
              Engine: Python 3.11 / ONNX 1.16+
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-700 font-sans">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>
              {chainVerification === null
                ? "Audit Hash Chain: ACTIVE"
                : chainVerification.is_chain_valid
                  ? "Audit Hash Chain: VALID"
                  : "Audit Hash Chain: INTEGRITY FAILURE"}
            </span>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await AssuranceApiClient.verifyAuditLedger();
                setChainVerification({
                  is_chain_valid: res.is_chain_valid,
                  errors: res.errors,
                });
              } catch (e) {
                setChainVerification({
                  is_chain_valid: false,
                  errors: [String(e)],
                });
              }
            }}
            className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-mono font-medium text-slate-700 cursor-pointer"
          >
            Verify Hash Chain
          </button>
        </div>

        {chainVerification && !chainVerification.is_chain_valid && (
          <div className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-xs text-rose-700 font-mono space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Ledger Tampering Detected:</span>
            </div>
            {chainVerification.errors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
