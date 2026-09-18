"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { operatorAtom, assessmentTabAtom } from "@/client/state/atoms";
import { AppSidebar, NavItemKey } from "@/client/components/layout/AppSidebar";
import { AppTopNav, ExplorerSecondaryTab } from "@/client/components/layout/AppTopNav";

interface WorkspaceShellProps {
  children: React.ReactNode;
  activeNav?: NavItemKey;
  title: string;
  showSecondaryTabs?: boolean;
  searchPlaceholder?: string;
  shortcutKey?: string;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  children,
  activeNav,
  title,
  showSecondaryTabs = false,
  searchPlaceholder = "Search assessments...",
  shortcutKey = "⌘K",
}) => {
  const router = useRouter();
  const [operator] = useAtom(operatorAtom);
  const [secondaryTab, setSecondaryTab] = useAtom(assessmentTabAtom);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (mounted) setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated && !operator) {
      router.replace("/login");
    }
  }, [hydrated, operator, router]);

  if (!hydrated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f8fafc] text-xs font-mono text-slate-400">
        Initializing workstation...
      </div>
    );
  }

  if (!operator) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f8fafc] text-[#0f172a] flex antialiased font-sans">
      <AppSidebar
        activeTab={activeNav}
        onNewAssessment={() => router.push("/assessments/new")}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
        <AppTopNav
          title={title}
          activeSecondaryTab={secondaryTab}
          onSecondaryTabChange={(tab: ExplorerSecondaryTab) => setSecondaryTab(tab)}
          showSecondaryTabs={showSecondaryTabs}
          searchPlaceholder={searchPlaceholder}
          shortcutKey={shortcutKey}
        />

        <div className="flex-1 overflow-y-auto">
          <main className="px-8 py-6 max-w-7xl w-full mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
};
