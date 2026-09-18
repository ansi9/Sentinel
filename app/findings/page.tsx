"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import {
  activeReportAtom,
  assessmentTabAtom,
  selectedFindingIdAtom,
} from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { FindingsQueueView } from "@/client/components/assessment/FindingsQueueView";
import { AssuranceApiClient, StoredReportSummary } from "@/client/lib/api-client";
import { FindingSchema } from "@/shared/types/assurance";

function FindingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeReport, setActiveReport] = useAtom(activeReportAtom);
  const setSecondaryTab = useSetAtom(assessmentTabAtom);
  const setSelectedFindingId = useSetAtom(selectedFindingIdAtom);

  const [scope, setScope] = useState<"fleet" | "assessment">("fleet");
  const [reportSummaries, setReportSummaries] = useState<StoredReportSummary[]>([]);
  const [fleetFindings, setFleetFindings] = useState<Array<FindingSchema & { report_id?: string }>>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const summaries = await AssuranceApiClient.listReportSummaries(100);
        if (!isMounted) return;
        setReportSummaries(summaries);

        const allFindings = await AssuranceApiClient.listAllFindings(150);
        if (!isMounted) return;
        setFleetFindings(allFindings);

        const paramId = searchParams.get("id");
        if (paramId) {
          setScope("assessment");
          setSelectedReportId(paramId);
        } else if (activeReport?.report_id) {
          setSelectedReportId(activeReport.report_id);
        } else if (summaries.length > 0) {
          setSelectedReportId(summaries[0].report_id);
        }
      } catch (err) {
        console.error("Failed to load findings data:", err);
      }
    }

    Promise.resolve().then(() => {
      if (!isMounted) return;
      loadData();
    });

    return () => {
      isMounted = false;
    };
  }, [searchParams, activeReport]);

  // Handle switching report when in assessment scope
  const handleSelectReportId = async (repId: string) => {
    setSelectedReportId(repId);
    try {
      const rep = await AssuranceApiClient.getReportById(repId);
      setActiveReport(rep);
    } catch (err) {
      console.error("Failed to load report for findings:", err);
    }
  };

  const handleSelectFinding = async (findingId: string, reportId?: string) => {
    setSelectedFindingId(findingId);
    setSecondaryTab("evidence");
    const targetId = reportId || activeReport?.report_id || selectedReportId;
    if (targetId && (!activeReport || activeReport.report_id !== targetId)) {
      try {
        const rep = await AssuranceApiClient.getReportById(targetId);
        setActiveReport(rep);
      } catch (err) {
        console.error("Failed to fetch report for finding:", err);
      }
    }
    router.push(targetId ? `/assessments?tab=evidence&id=${encodeURIComponent(targetId)}` : "/assessments?tab=evidence");
  };

  const currentDisplayFindings =
    scope === "fleet"
      ? fleetFindings
      : (activeReport?.findings && activeReport.report_id === selectedReportId
          ? activeReport.findings.map((f) => ({ ...f, report_id: selectedReportId }))
          : fleetFindings.filter((f) => f.report_id === selectedReportId));

  return (
    <WorkspaceShell
      title="Findings Queue"
      activeNav="findings"
      searchPlaceholder="Search findings, models, IDs..."
      shortcutKey="⌘K"
    >
      <FindingsQueueView
        findings={currentDisplayFindings}
        activeReportId={scope === "assessment" ? selectedReportId : undefined}
        reportSummaries={reportSummaries}
        scope={scope}
        onScopeChange={(newScope) => setScope(newScope)}
        onSelectReportId={handleSelectReportId}
        onSelectFinding={handleSelectFinding}
      />
    </WorkspaceShell>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={null}>
      <FindingsContent />
    </Suspense>
  );
}
