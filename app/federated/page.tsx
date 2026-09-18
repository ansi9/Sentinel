"use client";

import React from "react";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { FederatedLearningView } from "@/client/components/federated/FederatedLearningView";

export default function FederatedPage() {
  return (
    <WorkspaceShell
      title="Federated Learning"
      activeNav="federated"
      searchPlaceholder="Search branches, rounds..."
      shortcutKey="/"
    >
      <FederatedLearningView />
    </WorkspaceShell>
  );
}
