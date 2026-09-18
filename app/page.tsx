"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { activeScenarioAtom, assessmentTabAtom } from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { HomeDashboardView } from "@/client/components/home/HomeDashboardView";

export default function HomeDashboardPage() {
  const router = useRouter();
  const setActiveScenario = useSetAtom(activeScenarioAtom);
  const setSecondaryTab = useSetAtom(assessmentTabAtom);

  const handleNavigateToAssessment = (assessmentId: string) => {
    setSecondaryTab("overview");
    if (assessmentId) {
      setActiveScenario("A");
    }
    router.push("/assessments");
  };

  return (
    <WorkspaceShell
      title="Fleet & Trust Dashboard"
      activeNav="home"
      searchPlaceholder="Search assessments..."
      shortcutKey="⌘K"
    >
      <HomeDashboardView
        onNavigateToAssessment={handleNavigateToAssessment}
        onViewAllAssessments={() => {
          setSecondaryTab("overview");
          router.push("/assessments");
        }}
        onViewAllFindings={() => router.push("/findings")}
      />
    </WorkspaceShell>
  );
}
