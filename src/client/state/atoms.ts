"use client";

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { AssuranceReport, AuditLogEntry } from "@/shared/types/assurance";
import { OperatorProfile } from "@/client/components/auth/AuthStationLogin";
import { ExplorerSecondaryTab } from "@/client/components/layout/AppTopNav";

export const operatorAtom = atomWithStorage<OperatorProfile | null>(
  "intelx_operator",
  {
    name: "Dr. A. Turing",
    role: "analyst",
  }
);

export const activeReportAtom = atomWithStorage<AssuranceReport | null>(
  "intelx_active_report",
  null
);

export const auditEntriesAtom = atomWithStorage<AuditLogEntry[]>(
  "intelx_audit_entries",
  []
);

export const activeScenarioAtom = atomWithStorage<string>(
  "intelx_active_scenario",
  "A"
);

export const assessmentTabAtom = atomWithStorage<ExplorerSecondaryTab>(
  "intelx_assessment_tab",
  "overview"
);

export const authEmailAtom = atomWithStorage<string>(
  "intelx_auth_email",
  "marcus.vance@us-defense.ai"
);

export const selectedFindingIdAtom = atom<string | null>(null);

export const scenarioLoadingAtom = atom<boolean>(false);
