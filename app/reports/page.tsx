"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { activeReportAtom, assessmentTabAtom } from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { ReportsView } from "@/client/components/reports/ReportsView";
import { AssuranceReport } from "@/shared/types/assurance";

export default function ReportsPage() {
  const router = useRouter();
  const setActiveReport = useSetAtom(activeReportAtom);
  const setSecondaryTab = useSetAtom(assessmentTabAtom);

  const handleOpenReport = (_reportId: string, report: AssuranceReport) => {
    if (report) {
      setActiveReport(report);
      setSecondaryTab("overview");
      router.push("/assessments");
    }
  };

  return (
    <WorkspaceShell
      title="Assurance Reports"
      activeNav="reports"
      searchPlaceholder="Search archive..."
      shortcutKey="⌘K"
    >
      <ReportsView
        onOpenReport={handleOpenReport}
        onGenerateReport={() => router.push("/assessments/new")}
      />
    </WorkspaceShell>
  );
}
