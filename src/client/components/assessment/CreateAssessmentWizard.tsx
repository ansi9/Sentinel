"use client";

import React, { useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Lightbulb,
  Upload,
  Cpu,
  CheckCircle2,
  FileCheck,
  Shield,
  Layers,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { AssuranceReport, ContributorRiskSummary, FindingSchema } from "@/shared/types/assurance";

interface CreateAssessmentWizardProps {
  onBack: () => void;
  onComplete: (report: AssuranceReport, name: string) => void;
}

export interface AssessmentFormData {
  name: string;
  description: string;
  assessmentType: string;
  useCaseDomain: string;
  tags: string;
  modelFile?: File | null;
  datasetFile?: File | null;
}

/** Unlike the demo/mockup version of this wizard, "Launch Assessment" here
 * actually runs the real backend pipeline against whatever files were
 * uploaded in Step 2 -- the same upload -> analyze -> generate-report
 * chain proven end-to-end elsewhere in this app, not a canned scenario
 * substituted for the user's real input. */
export const CreateAssessmentWizard: React.FC<CreateAssessmentWizardProps> = ({
  onBack,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [formData, setFormData] = useState<AssessmentFormData>({
    name: "",
    description: "",
    assessmentType: "",
    useCaseDomain: "",
    tags: "",
    modelFile: null,
    datasetFile: null,
  });

  const [errors, setErrors] = useState<{ name?: string; type?: string }>({});

  // -- Real pipeline execution state --
  const [modelSavedPath, setModelSavedPath] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchStage, setLaunchStage] = useState<string | null>(null);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { name?: string; type?: string } = {};
    if (!formData.name.trim()) {
      newErrors.name = "Assessment name is required.";
    }
    if (!formData.assessmentType) {
      newErrors.type = "Please select an assessment type.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setCurrentStep(2);
  };

  const runRealAssessment = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      let combinedFindings: FindingSchema[] = [];
      let contributorSummaries: ContributorRiskSummary[] = [];
      let savedModelPath = modelSavedPath;
      let modelId: string | undefined;
      let probeImagePaths: string[] = [];
      let datasetClasses: string[] = [];
      let deepProbesUnavailableReason: string | null = null;

      if (formData.modelFile) {
        setLaunchStage("Uploading and fingerprinting model...");
        const fp = await AssuranceApiClient.uploadModel(formData.modelFile);
        savedModelPath = (fp.metadata?.saved_path as string) || null;
        modelId = fp.model_id;
        setModelSavedPath(savedModelPath);
        if (savedModelPath) {
          setLaunchStage("Running parameter analysis...");
          const params = await AssuranceApiClient.runParameterAnalysis(savedModelPath, fp.model_id);
          combinedFindings = [...combinedFindings, ...params.findings];
        }
      }

      if (formData.datasetFile) {
        setLaunchStage("Uploading and extracting dataset...");
        const upload = await AssuranceApiClient.uploadDatasetArchive(formData.datasetFile);
        if (!upload.coco_json_candidates.length && !upload.yolo_dir_candidate) {
          throw new Error(
            "Archive did not contain a recognizable COCO annotations JSON or a YOLO images/+labels/ pair."
          );
        }
        setLaunchStage("Analyzing dataset integrity...");
        const result = upload.coco_json_candidates.length
          ? await AssuranceApiClient.analyzeDatasetProfile({
              datasetId: formData.name.replace(/\s+/g, "_").toLowerCase() || "assessment_dataset",
              formatType: "COCO",
              cocoPath: upload.coco_json_candidates[0],
              // Without this, image-dependent checks (OOD, duplicate
              // hashing, poisoning triggers, backdoor/trigger probing
              // below) silently degrade to their no-pixel fallback for
              // the documented "coco.json + images/" archive layout.
              imagesDir: upload.coco_images_dir ?? undefined,
            })
          : await AssuranceApiClient.analyzeDatasetProfile({
              datasetId: formData.name.replace(/\s+/g, "_").toLowerCase() || "assessment_dataset",
              formatType: "YOLO",
              yoloDir: upload.yolo_dir_candidate!,
            });
        combinedFindings = [...combinedFindings, ...result.findings];
        contributorSummaries = result.profile.contributor_risks;
        probeImagePaths = result.probe_sample_image_paths;
        datasetClasses = result.profile.classes;
      }

      if (!formData.modelFile && !formData.datasetFile) {
        throw new Error("No model or dataset was provided in Step 2 -- add at least one asset before launching.");
      }

      // Model execution-based checks (backdoor probing, blind trigger
      // reconstruction) need real images to run the model against --
      // they only activate when both a model AND a dataset were
      // provided, using real images pulled from that same dataset rather
      // than a separately uploaded probe set. Best-effort: a failure here
      // (unsupported architecture, HASH_ONLY access, etc.) is recorded as
      // a limitation, not a fatal error for the whole assessment -- the
      // backend already reports these as explicit UNAVAILABLE results
      // rather than throwing, so only genuine transport/network failures
      // reach this catch.
      if (savedModelPath && modelId && probeImagePaths.length > 0) {
        try {
          setLaunchStage("Probing for known-trigger backdoor activation...");
          const probe = await AssuranceApiClient.runBackdoorProbe({
            modelPath: savedModelPath,
            probeImagePaths,
            modelId,
          });
          combinedFindings = [...combinedFindings, ...probe.findings];
        } catch (e) {
          deepProbesUnavailableReason = e instanceof Error ? e.message : String(e);
        }

        if (datasetClasses.length > 0) {
          try {
            setLaunchStage("Reconstructing unknown triggers (Neural Cleanse)...");
            const reconstruction = await AssuranceApiClient.runTriggerReconstruction({
              modelPath: savedModelPath,
              cleanImagePaths: probeImagePaths,
              classNames: datasetClasses,
              modelId,
            });
            combinedFindings = [...combinedFindings, ...reconstruction.findings];
          } catch (e) {
            deepProbesUnavailableReason = e instanceof Error ? e.message : String(e);
          }
        }
      }

      setLaunchStage("Compiling assurance report...");
      // Status fields reflect what this wizard actually ran -- "VERIFIED"
      // only for a check that genuinely executed, "UNAVAILABLE" for one it
      // never performed (inference provenance and distribution-shift
      // checks aren't collected by this wizard, matching the disclosure
      // already shown to the user in Step 3 below).
      const report = await AssuranceApiClient.generateReport({
        findings: combinedFindings,
        contributorSummaries,
        modelStatus: formData.modelFile ? "VERIFIED" : "UNAVAILABLE",
        datasetStatus: formData.datasetFile ? "VERIFIED" : "UNAVAILABLE",
        inferenceStatus: "UNAVAILABLE",
        driftStatus: "UNAVAILABLE",
      });

      if (deepProbesUnavailableReason) {
        report.limitations = [
          ...report.limitations,
          `Backdoor probe / trigger reconstruction did not complete: ${deepProbesUnavailableReason}`,
        ];
      }

      onComplete(report, formData.name);
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
      setLaunchStage(null);
    }
  };

  const steps = [
    { number: 1, label: "Assessment Details" },
    { number: 2, label: "Add Assets" },
    { number: 3, label: "Validate" },
    { number: 4, label: "Review & Start" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Back Navigation */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Assessments</span>
        </button>
      </div>

      {/* Page Heading */}
      <div>
        <div className="flex items-center gap-2.5 mb-1 text-xs font-mono text-slate-500">
          <Image
            src="/logo_withoutlabel.png"
            alt="Sentinel Logo"
            width={16}
            height={16}
            className="h-4 w-auto object-contain"
          />
          <span>SENTINEL PRE-TRAINING DATA FIREWALL</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Create New Assessment
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Provide details and upload assets to start a new assurance assessment.
        </p>
      </div>

      {/* 4-Step Stepper Header */}
      <div className="flex items-center justify-between max-w-3xl py-4">
        {steps.map((step, idx) => {
          const isActive = currentStep === step.number;
          const isDone = currentStep > step.number;
          return (
            <React.Fragment key={step.number}>
              <div
                onClick={() => isDone && setCurrentStep(step.number)}
                className={clsx(
                  "flex items-center gap-2 text-xs font-semibold",
                  isDone ? "cursor-pointer" : "cursor-default"
                )}
              >
                <div
                  className={clsx(
                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    isActive
                      ? "bg-sky-600 text-white shadow-sm shadow-sky-500/30"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                </div>
                <span
                  className={clsx(
                    isActive
                      ? "text-slate-900 font-bold"
                      : isDone
                        ? "text-slate-700"
                        : "text-slate-400 font-medium"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className={clsx(
                    "flex-1 mx-4 h-0.5 transition-all",
                    currentStep > step.number ? "bg-emerald-400" : "bg-slate-200"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Main 2-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Step Content / Form */}
        <div className="lg:col-span-8">
          {currentStep === 1 && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  Assessment Details
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provide basic information about the assessment.
                </p>
              </div>

              <form onSubmit={handleStep1Submit} className="mt-5 space-y-5">
                {/* Assessment Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Assessment Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Satellite Detector v2 Integrity Check"
                    className={clsx(
                      "w-full rounded-lg border px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition-all",
                      errors.name ? "border-rose-400 bg-rose-50/20" : "border-slate-300"
                    )}
                  />
                  {errors.name ? (
                    <p className="text-[11px] text-rose-600 mt-1">{errors.name}</p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      A clear and unique name for this assessment.
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe the purpose, scope, and context of this assessment..."
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition-all resize-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Optional but recommended.
                  </p>
                </div>

                {/* Row: Assessment Type & Use Case */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Assessment Type <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={formData.assessmentType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          assessmentType: e.target.value,
                        })
                      }
                      className={clsx(
                        "w-full rounded-lg border px-3.5 py-2.5 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition-all",
                        errors.type ? "border-rose-400" : "border-slate-300"
                      )}
                    >
                      <option value="">Select assessment type</option>
                      <option value="FULL_PIPELINE">
                        Full Pipeline Assurance (Data + Model + Inference)
                      </option>
                      <option value="MODEL_BACKDOOR">
                        Model Vulnerability & Backdoor Audit
                      </option>
                      <option value="DATASET_POISONING">
                        Dataset Poisoning & Contributor Triage
                      </option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Choose the primary focus of this assessment.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Use Case / Domain
                    </label>
                    <input
                      type="text"
                      value={formData.useCaseDomain}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          useCaseDomain: e.target.value,
                        })
                      }
                      placeholder="e.g., Satellite Imagery, Object Detection"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition-all"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      The operational domain or application.
                    </p>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Tags (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) =>
                      setFormData({ ...formData, tags: e.target.value })
                    }
                    placeholder="Add tags (e.g., production, internal, sprint-23)"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Add relevant tags to help organize and filter assessments.
                  </p>
                </div>

                {/* Actions */}
                <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                  <span className="text-[11px] text-slate-400">
                    Fields marked with <span className="text-rose-600">*</span>{" "}
                    are required.
                  </span>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 active:bg-sky-800 transition-all cursor-pointer"
                  >
                    <span>Save and Continue</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {currentStep === 2 && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  Step 2: Add Pipeline Assets
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload an ONNX/PyTorch/TorchScript model and/or a COCO/YOLO dataset archive.
                  At least one is required -- these are the real files the assurance engine will run against.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Model Asset */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 hover:border-sky-500/80 bg-slate-50/50 flex flex-col items-center text-center space-y-2">
                  <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    Model Weights (.onnx, .pt, .pth, .torchscript)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Candidate model file for parameter analysis & substitution checks.
                  </p>
                  <label className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Choose Model File</span>
                    <input
                      type="file"
                      accept=".onnx,.pt,.pth,.torchscript"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setFormData({
                            ...formData,
                            modelFile: e.target.files[0],
                          });
                        }
                      }}
                    />
                  </label>
                  {formData.modelFile && (
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                      ✓ {formData.modelFile.name}
                      <button
                        onClick={() => setFormData({ ...formData, modelFile: null })}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>

                {/* Dataset Asset */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 hover:border-sky-500/80 bg-slate-50/50 flex flex-col items-center text-center space-y-2">
                  <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    Dataset Archive (.zip)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    A zipped COCO annotations JSON + images, or a YOLO images/+labels/ pair.
                  </p>
                  <label className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Choose Archive</span>
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setFormData({
                            ...formData,
                            datasetFile: e.target.files[0],
                          });
                        }
                      }}
                    />
                  </label>
                  {formData.datasetFile && (
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                      ✓ {formData.datasetFile.name}
                      <button
                        onClick={() => setFormData({ ...formData, datasetFile: null })}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={!formData.modelFile && !formData.datasetFile}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>Continue to Validate</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  Step 3: Assessment Readiness
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  What was provided, and what that means for the checks this assessment can actually run.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div
                  className={clsx(
                    "p-3.5 rounded-lg border flex items-center justify-between",
                    formData.modelFile ? "bg-emerald-50/70 border-emerald-200" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className={clsx("flex items-center gap-2", formData.modelFile ? "text-emerald-900" : "text-slate-500")}>
                    {formData.modelFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Cpu className="h-4 w-4 text-slate-400" />}
                    <span className="font-semibold">Model Integrity Checks (parameter analysis)</span>
                  </div>
                  <span className={clsx("font-mono text-[11px] font-bold", formData.modelFile ? "text-emerald-700" : "text-slate-400")}>
                    {formData.modelFile ? `READY (${formData.modelFile.name})` : "UNAVAILABLE — no model provided"}
                  </span>
                </div>

                <div
                  className={clsx(
                    "p-3.5 rounded-lg border flex items-center justify-between",
                    formData.datasetFile ? "bg-emerald-50/70 border-emerald-200" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className={clsx("flex items-center gap-2", formData.datasetFile ? "text-emerald-900" : "text-slate-500")}>
                    {formData.datasetFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Layers className="h-4 w-4 text-slate-400" />}
                    <span className="font-semibold">Dataset Integrity Checks</span>
                  </div>
                  <span className={clsx("font-mono text-[11px] font-bold", formData.datasetFile ? "text-emerald-700" : "text-slate-400")}>
                    {formData.datasetFile ? `READY (${formData.datasetFile.name})` : "UNAVAILABLE — no dataset provided"}
                  </span>
                </div>

                <div
                  className={clsx(
                    "p-3.5 rounded-lg border flex items-center justify-between",
                    formData.modelFile && formData.datasetFile ? "bg-emerald-50/70 border-emerald-200" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className={clsx("flex items-center gap-2", formData.modelFile && formData.datasetFile ? "text-emerald-900" : "text-slate-500")}>
                    {formData.modelFile && formData.datasetFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Shield className="h-4 w-4 text-slate-400" />}
                    <span className="font-semibold">Backdoor Probe & Trigger Reconstruction</span>
                  </div>
                  <span className={clsx("font-mono text-[11px] font-bold", formData.modelFile && formData.datasetFile ? "text-emerald-700" : "text-slate-400")}>
                    {formData.modelFile && formData.datasetFile
                      ? "READY (runs against real dataset images)"
                      : "UNAVAILABLE — needs both a model and a dataset"}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <FileCheck className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold">Inference Provenance Checks</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-slate-400">
                    UNAVAILABLE — not collected by this wizard
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-sky-50/70 border border-sky-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-900">
                    <FileCheck className="h-4 w-4 text-sky-600" />
                    <span className="font-semibold">Target Domain</span>
                  </div>
                  <span className="font-medium text-sky-700">
                    {formData.useCaseDomain || "Computer Vision Pipeline"}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 cursor-pointer"
                >
                  <span>Review & Start</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  Step 4: Review Assessment Configuration
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm assessment parameters before launching the air-gapped assurance engine
                  against your real uploaded files.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-bold text-slate-900">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Type:</span>
                  <span className="font-semibold text-slate-800">
                    {formData.assessmentType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Domain:</span>
                  <span className="font-medium text-slate-700">
                    {formData.useCaseDomain || "General Vision"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Model File:</span>
                  <span className="font-mono text-slate-700">
                    {formData.modelFile?.name || "None provided"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dataset File:</span>
                  <span className="font-mono text-slate-700">
                    {formData.datasetFile?.name || "None provided"}
                  </span>
                </div>
              </div>

              {launchStage && (
                <div className="flex items-center gap-2 rounded-lg bg-sky-50 border border-sky-200 p-3 text-xs text-sky-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{launchStage}</span>
                </div>
              )}

              {launchError && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{launchError}</span>
                </div>
              )}

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={launching}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={runRealAssessment}
                  disabled={launching}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  <span>{launching ? "Running Assurance..." : "Launch Assessment"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Information & Help Panel */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
            {/* About New Assessment */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Info className="h-4 w-4 text-sky-600" />
                <span>About New Assessment</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                An assessment evaluates the trust and integrity of a computer
                vision pipeline by analyzing data, models, and inference outputs.
              </p>

              <div className="pt-2">
                <div className="text-xs font-semibold text-slate-800 mb-2">
                  You will be able to:
                </div>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold">•</span>
                    <span>Upload a real dataset and/or model</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold">•</span>
                    <span>Run real assurance checks against those files</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold">•</span>
                    <span>Investigate findings with real evidence</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-500 font-bold">•</span>
                    <span>Generate a formal, signed assurance report</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Tips Box */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span>Tips</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Providing both a model and a dataset produces the most complete assessment,
                but either one alone is enough to launch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
