"use client";

import React from "react";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { DriftEvaluationRunner } from "@/client/components/drift/DriftEvaluationRunner";

export default function DriftPage() {
  return (
    <WorkspaceShell
      title="Distribution Shift"
      activeNav="drift"
      searchPlaceholder="Search reference baselines..."
      shortcutKey="/"
    >
      <DriftEvaluationRunner />
    </WorkspaceShell>
  );
}
