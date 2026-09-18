"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { activeReportAtom, assessmentTabAtom } from "@/client/state/atoms";
import { WorkspaceShell } from "@/client/components/layout/WorkspaceShell";
import { UniversalAssetDropzone } from "@/client/components/assessment/UniversalAssetDropzone";
import { CreateAssessmentWizard } from "@/client/components/assessment/CreateAssessmentWizard";
import { AssuranceReport } from "@/shared/types/assurance";
import { ArrowLeft, SlidersHorizontal, Sparkles } from "lucide-react";

export default function NewAssessmentPage() {
  const router = useRouter();
  const setActiveReport = useSetAtom(activeReportAtom);
  const setSecondaryTab = useSetAtom(assessmentTabAtom);
  const [showAdvancedWizard, setShowAdvancedWizard] = useState(false);

  const handleComplete = (report: AssuranceReport) => {
    setActiveReport(report);
    setSecondaryTab("overview");
    router.push("/assessments");
  };

  return (
    <WorkspaceShell
      title="Launch Integrity Assessment"
      activeNav="assessments"
      searchPlaceholder="Search models, files, datasets..."
      shortcutKey="⌘K"
    >
      <div className="space-y-6 max-w-4xl mx-auto font-sans">
        {/* Navigation & Mode Toggle */}
        <div className="flex items-center justify-between pb-2">
          <button
            onClick={() => router.push("/assessments")}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Assessments</span>
          </button>

          <button
            onClick={() => setShowAdvancedWizard(!showAdvancedWizard)}
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{showAdvancedWizard ? "Switch to Instant Drop & Audit" : "Advanced Multi-Step Form"}</span>
          </button>
        </div>

        {!showAdvancedWizard ? (
          <div className="space-y-6">
            {/* Header description */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  TRACK 02: TRUST, SAFETY & DIGITAL SECURITY
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Instant Asset Integrity Assessment</span>
                <Sparkles className="h-4 w-4 text-sky-600" />
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed font-sans max-w-2xl">
                Drop your vision model, training dataset archive, or inference log. The engine automatically identifies
                the format, extracts cryptographic fingerprints, runs multi-vector checks (poisoning, backdoors, provenance),
                and delivers the formal Assurance Report.
              </p>
            </div>

            {/* The Dropzone */}
            <UniversalAssetDropzone onAssessmentComplete={handleComplete} />
          </div>
        ) : (
          <CreateAssessmentWizard
            onBack={() => setShowAdvancedWizard(false)}
            onComplete={handleComplete}
          />
        )}
      </div>
    </WorkspaceShell>
  );
}
