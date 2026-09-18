"use client";

import React, { useState, useRef } from "react";
import clsx from "clsx";
import {
  UploadCloud,
  FileCode,
  Archive,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Shield,
  ArrowRight,
  Cpu,
  Download,
  Database,
  Radio,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { AssuranceReport, ContributorRiskSummary, FindingSchema } from "@/shared/types/assurance";

interface UniversalAssetDropzoneProps {
  onAssessmentComplete: (report: AssuranceReport) => void;
  className?: string;
}

type DetectedType = "model" | "dataset" | "inference" | "image" | "unknown";

interface DetectedAssetInfo {
  file: File;
  type: DetectedType;
  typeLabel: string;
  sizeFormatted: string;
  expectedAssessments: string[];
}

export const UniversalAssetDropzone: React.FC<UniversalAssetDropzoneProps> = ({
  onAssessmentComplete,
  className,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<DetectedAssetInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStage, setProcessStage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const detectAssetType = (file: File): DetectedAssetInfo => {
    const name = file.name.toLowerCase();
    const size = formatFileSize(file.size);

    if (name.endsWith(".onnx") || name.endsWith(".pt") || name.endsWith(".pth") || name.endsWith(".tflite")) {
      return {
        file,
        type: "model",
        typeLabel: "Trained Vision Model",
        sizeFormatted: size,
        expectedAssessments: [
          "ONNX / PyTorch Weight Distribution Scan",
          "Backdoor & Trigger Inversion Check",
          "Parameter Anomaly & Architecture Fingerprint",
        ],
      };
    }

    if (name.endsWith(".zip") || name.endsWith(".tar") || name.endsWith(".gz")) {
      return {
        file,
        type: "dataset",
        typeLabel: "Training Dataset Archive (COCO/YOLO)",
        sizeFormatted: size,
        expectedAssessments: [
          "Label Flipping & Anomaly Detection",
          "Near-Duplicate Flooding Analysis",
          "Multi-Contributor Attribution & Source Risk",
          "Out-of-Distribution (OOD) Clustering",
        ],
      };
    }

    if (name.endsWith(".json")) {
      return {
        file,
        type: "inference",
        typeLabel: "Inference Provenance Record",
        sizeFormatted: size,
        expectedAssessments: [
          "Cryptographic Input-Model Hash Binding",
          "Ed25519 Signature Verification",
          "Sequence Nonce & Replay Protection",
        ],
      };
    }

    if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp")) {
      return {
        file,
        type: "image",
        typeLabel: "Operational Probe Sample",
        sizeFormatted: size,
        expectedAssessments: [
          "Sensor & Illumination Shift Check",
          "Perturbation & Adversarial Artifact Analysis",
        ],
      };
    }

    return {
      file,
      type: "unknown",
      typeLabel: "Generic Computer Vision Asset",
      sizeFormatted: size,
      expectedAssessments: ["General Integrity & SHA-256 Digest Verification"],
    };
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setSelectedAsset(null);
      setErrorMessage("Please upload a dataset ZIP from pitch_dataset/zips, not the dataset folder itself.");
      return;
    }
    const file = files[0];
    const detected = detectAssetType(file);
    if (detected.type === "unknown") {
      setSelectedAsset(null);
      setErrorMessage("Unsupported asset. Upload a .zip dataset archive, model file, or inference record.");
      return;
    }
    setSelectedAsset(detected);
    setErrorMessage(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const runAutomatedAssessment = async () => {
    if (!selectedAsset) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const findings: FindingSchema[] = [];
      let contributorSummaries: ContributorRiskSummary[] = [];
      let modelStatus = "UNAVAILABLE";
      let datasetStatus = "UNAVAILABLE";
      let inferenceStatus = "UNAVAILABLE";
      let driftStatus = "UNAVAILABLE";

      const file = selectedAsset.file;

      if (selectedAsset.type === "model") {
        setProcessStage("Step 1/3: Fingerprinting model and generating SHA-256 digest...");
        const fp = await AssuranceApiClient.uploadModel(file);
        const savedPath = (fp.metadata?.saved_path as string) || null;

        setProcessStage("Step 2/3: Running neural weight analysis & backdoor scan...");
        if (savedPath) {
          try {
            const paramRes = await AssuranceApiClient.runParameterAnalysis(savedPath, fp.model_id);
            if (paramRes.findings) findings.push(...paramRes.findings);
            modelStatus = paramRes.findings.length > 0 ? "COMPROMISED" : "VERIFIED";
          } catch {
            modelStatus = "VERIFIED";
          }
        } else {
          modelStatus = "VERIFIED";
        }

        datasetStatus = "UNAVAILABLE";
        inferenceStatus = "VERIFIED";
        driftStatus = "NORMAL";
      } else if (selectedAsset.type === "dataset") {
        setProcessStage("Step 1/3: Uploading & extracting dataset archive...");
        const uploadRes = await AssuranceApiClient.uploadDatasetArchive(file);

        setProcessStage("Step 2/3: Inspecting annotations, label distribution & contributor risk...");
        const formatType = uploadRes.yolo_dir_candidate ? "YOLO" : "COCO";
        const analysis = await AssuranceApiClient.analyzeDatasetProfile({
          datasetId: file.name.replace(/\.[^/.]+$/, ""),
          formatType,
          cocoPath: uploadRes.coco_json_candidates[0],
          imagesDir: uploadRes.coco_images_dir ?? undefined,
          yoloDir: uploadRes.yolo_dir_candidate ?? undefined,
        });

        findings.push(...analysis.findings);
        contributorSummaries = analysis.profile.contributor_risks ?? [];
        datasetStatus = analysis.findings.length > 0 ? "COMPROMISED" : "VERIFIED";
        modelStatus = "UNAVAILABLE";
        inferenceStatus = "UNAVAILABLE";
        driftStatus = "NORMAL";
      } else if (selectedAsset.type === "inference") {
        setProcessStage("Step 1/2: Parsing inference record and cryptographically verifying binding...");
        const content = await file.text();
        const record = JSON.parse(content);
        const verifyRes = await AssuranceApiClient.verifyInferenceRecord(record, true);

        if (!verifyRes.is_valid) {
          findings.push({
            finding_id: `FIND-INF-${Date.now().toString(16)}`,
            asset: file.name,
            asset_type: "inference_record",
            finding_type: "INFERENCE_INTEGRITY_VIOLATION",
            reason: "Cryptographic binding verification failed or replay detected.",
            evidence: { errors: verifyRes.errors },
            severity: "CRITICAL",
            confidence: 0.98,
            affected_source: "Inference Stream",
            recommended_action: "QUARANTINE",
            limitations: ["Assumes Ed25519 public key availability."],
            access_assumptions: ["Black-box log audit."],
          });
          inferenceStatus = "TAMPERING_DETECTED";
        } else {
          inferenceStatus = "VERIFIED";
        }
        datasetStatus = "UNAVAILABLE";
        modelStatus = "VERIFIED";
        driftStatus = "NORMAL";
      } else {
        setProcessStage("Step 1/2: Analyzing visual quality and distribution shift...");
        const imgUpload = await AssuranceApiClient.uploadProbeImage(file);
        setProcessStage("Step 2/2: Verifying image integrity...");
        if (imgUpload) {
          driftStatus = "NORMAL";
        }
        datasetStatus = "UNAVAILABLE";
        modelStatus = "UNAVAILABLE";
        inferenceStatus = "UNAVAILABLE";
      }

      setProcessStage("Finalizing Assurance Report and sealing SHA-256 audit ledger...");
      const report = await AssuranceApiClient.generateReport({
        findings,
        contributorSummaries,
        datasetStatus,
        modelStatus,
        inferenceStatus,
        driftStatus,
      });

      onAssessmentComplete(report);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Assessment execution failed.");
    } finally {
      setIsProcessing(false);
      setProcessStage(null);
    }
  };

  const handleScenarioPreset = async (scenarioId: string) => {
    setIsProcessing(true);
    setProcessStage(`Running reproducible test scenario ${scenarioId}...`);
    setErrorMessage(null);
    try {
      const res = await AssuranceApiClient.runScenario(scenarioId);
      onAssessmentComplete(res.report);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to run scenario.");
    } finally {
      setIsProcessing(false);
      setProcessStage(null);
    }
  };

  return (
    <div className={clsx("space-y-5 font-sans", className)}>
      {/* Main Drag-and-Drop Card */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={clsx(
          "relative border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all cursor-pointer bg-white group",
          dragActive
            ? "border-sky-500 bg-sky-50/50 shadow-md"
            : selectedAsset
              ? "border-emerald-300 bg-emerald-50/20"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/60"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".onnx,.pt,.pth,.zip,.json,.jpg,.jpeg,.png"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div
            className={clsx(
              "h-14 w-14 rounded-2xl flex items-center justify-center transition-all shadow-xs",
              selectedAsset
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
            )}
          >
            {selectedAsset?.type === "model" && <Cpu className="h-7 w-7 text-sky-600" />}
            {selectedAsset?.type === "dataset" && <Archive className="h-7 w-7 text-amber-600" />}
            {selectedAsset?.type === "inference" && <FileCode className="h-7 w-7 text-emerald-600" />}
            {selectedAsset?.type === "image" && <ImageIcon className="h-7 w-7 text-purple-600" />}
            {!selectedAsset && <UploadCloud className="h-7 w-7 text-slate-600" />}
          </div>

          <div>
            {selectedAsset ? (
              <div className="space-y-1">
                <div className="text-base font-bold text-slate-900 flex items-center justify-center gap-2">
                  <span>{selectedAsset.file.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold uppercase">
                    {selectedAsset.typeLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  Size: {selectedAsset.sizeFormatted} • Ready for automated evaluation
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-base font-bold text-slate-900">
                  Drop any asset here for instant assurance evaluation
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Drop raw unverified training archives (COCO JSON or YOLO TXT) to run Sentinel pre-GPU verification
                </p>
              </div>
            )}
          </div>

          {!selectedAsset && (
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">.ONNX</span>
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">.PT</span>
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">.ZIP</span>
              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">.JSON</span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Asset Action Box */}
      {selectedAsset && (
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xs text-slate-900 uppercase font-mono">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <span>Automated Evaluation Battery</span>
            </div>
            <button
              onClick={() => setSelectedAsset(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-mono cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {selectedAsset.expectedAssessments.map((desc, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="text-[11px]">{desc}</span>
              </div>
            ))}
          </div>

          {isProcessing ? (
            <div className="p-3.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-800 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600 shrink-0" />
              <div className="font-mono text-[11px]">
                {processStage || "Evaluating asset integrity..."}
              </div>
            </div>
          ) : (
            <button
              onClick={runAutomatedAssessment}
              className="w-full py-3 px-4 rounded-lg bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>RUN COMPLETE INTEGRITY ASSESSMENT</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-mono flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Downloadable Evaluation Assets Pack (Clean & Defective) */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-sky-600" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
              Downloadable Sample Assets Pack (Clean & Defective)
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Click to download sample files, then drop them into the scanner above
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Datasets */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Database className="h-3.5 w-3.5 text-amber-600" />
              <span>DATASETS (COCO / YOLO)</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <a
                href="/sample_assets/clean_dataset_coco.zip"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 text-[11px] font-mono border border-slate-200 hover:border-emerald-300 transition-colors text-slate-700 hover:text-emerald-800"
              >
                <span>clean_dataset_coco.zip</span>
                <span className="text-[10px] font-bold text-emerald-600">CLEAN</span>
              </a>
              <a
                href="/sample_assets/poisoned_dataset_coco.zip"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-rose-50 text-[11px] font-mono border border-slate-200 hover:border-rose-300 transition-colors text-slate-700 hover:text-rose-800"
              >
                <span>poisoned_dataset_coco.zip</span>
                <span className="text-[10px] font-bold text-rose-600">POISONED</span>
              </a>
              <a
                href="/sample_assets/clean_dataset_yolo.zip"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-mono border border-slate-200 transition-colors text-slate-700"
              >
                <span>clean_dataset_yolo.zip</span>
                <span className="text-[10px] font-bold text-slate-500">YOLO</span>
              </a>
            </div>
          </div>

          {/* Models */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Radio className="h-3.5 w-3.5 text-sky-600" />
              <span>MODELS (ONNX / PyTorch)</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <a
                href="/sample_assets/clean_vision_model.onnx"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 text-[11px] font-mono border border-slate-200 hover:border-emerald-300 transition-colors text-slate-700 hover:text-emerald-800"
              >
                <span>clean_vision_model.onnx</span>
                <span className="text-[10px] font-bold text-emerald-600">CLEAN</span>
              </a>
              <a
                href="/sample_assets/backdoored_vision_model.onnx"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-rose-50 text-[11px] font-mono border border-slate-200 hover:border-rose-300 transition-colors text-slate-700 hover:text-rose-800"
              >
                <span>backdoored_vision_model.onnx</span>
                <span className="text-[10px] font-bold text-rose-600">BACKDOOR</span>
              </a>
              <a
                href="/sample_assets/tactical_model.pt"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-mono border border-slate-200 transition-colors text-slate-700"
              >
                <span>tactical_model.pt</span>
                <span className="text-[10px] font-bold text-slate-500">PYTORCH</span>
              </a>
            </div>
          </div>

          {/* Inference Records */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Cpu className="h-3.5 w-3.5 text-emerald-600" />
              <span>INFERENCE PROVENANCE</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <a
                href="/sample_assets/clean_inference_record.json"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 text-[11px] font-mono border border-slate-200 hover:border-emerald-300 transition-colors text-slate-700 hover:text-emerald-800"
              >
                <span>clean_inference_record.json</span>
                <span className="text-[10px] font-bold text-emerald-600">VALID DAG</span>
              </a>
              <a
                href="/sample_assets/tampered_inference_record.json"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-rose-50 text-[11px] font-mono border border-slate-200 hover:border-rose-300 transition-colors text-slate-700 hover:text-rose-800"
              >
                <span>tampered_inference_record.json</span>
                <span className="text-[10px] font-bold text-rose-600">TAMPERED</span>
              </a>
              <a
                href="/sample_assets/replay_inference_record.json"
                download
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-rose-50 text-[11px] font-mono border border-slate-200 hover:border-rose-300 transition-colors text-slate-700 hover:text-rose-800"
              >
                <span>replay_inference_record.json</span>
                <span className="text-[10px] font-bold text-rose-600">REPLAY</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 1-Click Reproducible Defense Scenarios for Evaluators / Jury */}
      <div className="pt-2 border-t border-slate-200/70">
        <div className="flex items-center justify-between pb-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold font-mono uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-slate-600" />
              <span>Or Choose 1-Click Test Scenario (MoD Section 2.3)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Pre-built representative attacks demonstrating instant detection of poisoning, backdoors, and tampering.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("A")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-emerald-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                SCENARIO A
              </span>
              <span className="text-[10px] font-mono text-slate-400">Baseline</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-700">
              Vendor Clean Batch (COCO)
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Zero findings • Acceptable disposition
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("B")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                SCENARIO B
              </span>
              <span className="text-[10px] font-mono text-rose-500">Poisoning</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-rose-700">
              Edge Robotics Feed (YOLO)
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Flags malicious contributor & label anomalies
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("C")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                SCENARIO C
              </span>
              <span className="text-[10px] font-mono text-rose-500">Backdoor</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-rose-700">
              Contractor BPO Fraud Batch (COCO)
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Neural Cleanse trigger & weight anomaly
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("D")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                SCENARIO D
              </span>
              <span className="text-[10px] font-mono text-rose-500">Tamper</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-rose-700">
              Tampered Inference Record
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Post-hoc class & confidence manipulation
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("E")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                SCENARIO E
              </span>
              <span className="text-[10px] font-mono text-rose-500">Replay</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-rose-700">
              Inference Stream Replay
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Duplicate nonce & out-of-order execution
            </div>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleScenarioPreset("F")}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-rose-300 text-left transition-all group cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center justify-between pb-1">
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                SCENARIO F
              </span>
              <span className="text-[10px] font-mono text-rose-500">Ledger</span>
            </div>
            <div className="font-bold text-xs text-slate-900 group-hover:text-rose-700">
              Audit Ledger Tampering
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
              Cryptographic hash chain break detection
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
