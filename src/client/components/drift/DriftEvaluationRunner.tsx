"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileJson,
  PlayCircle,
  CheckCircle2,
  Loader2,
  Compass,
  RotateCcw,
  ShieldCheck,
  Radio,
  FileArchive,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";
import { DistributionShiftReport } from "@/shared/types/assurance";
import { DistributionShiftView } from "./DistributionShiftView";

interface ParsedManifest {
  raw: Record<string, unknown>;
  declared_reference_id?: string;
  terrain?: string;
  sensor?: string;
  mean_illumination?: number;
}

export const DriftEvaluationRunner: React.FC = () => {
  const [manifest, setManifest] = useState<ParsedManifest | null>(null);
  const [manifestFileName, setManifestFileName] = useState<string | null>(null);
  const [datasetFileName, setDatasetFileName] = useState<string | null>(null);
  const [probePaths, setProbePaths] = useState<string[] | null>(null);
  const [analyzingDataset, setAnalyzingDataset] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DistributionShiftReport | undefined>(
    undefined,
  );

  const manifestInputRef = useRef<HTMLInputElement>(null);
  const datasetInputRef = useRef<HTMLInputElement>(null);

  const handleManifestFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setManifest({
        raw: parsed,
        declared_reference_id: parsed.declared_reference_id as
          | string
          | undefined,
        terrain: parsed.terrain as string | undefined,
        sensor: parsed.sensor as string | undefined,
        mean_illumination: parsed.mean_illumination as number | undefined,
      });
      setManifestFileName(file.name);
    } catch (e) {
      setError(
        `"${file.name}" is not a valid reference manifest JSON: ${
          e instanceof Error ? e.message : String(e)
        }. A declared reference_profile is required.`,
      );
    }
  };

  const handleDatasetFile = async (file: File) => {
    setError(null);
    setProbePaths(null);
    setAnalyzingDataset(true);
    try {
      const upload = await AssuranceApiClient.uploadDatasetArchive(file);
      const formatType: "COCO" | "YOLO" =
        upload.coco_json_candidates.length > 0 ? "COCO" : "YOLO";
      const analysis = await AssuranceApiClient.analyzeDatasetProfile({
        datasetId: `drift_probe_${Date.now()}`,
        formatType,
        cocoPath: upload.coco_json_candidates[0],
        imagesDir: upload.coco_images_dir ?? undefined,
        yoloDir: upload.yolo_dir_candidate ?? undefined,
      });
      setProbePaths(analysis.probe_sample_image_paths);
      setDatasetFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzingDataset(false);
    }
  };

  const runEvaluation = async () => {
    if (!manifest || !probePaths || probePaths.length === 0) {
      setError(
        "Load both a reference manifest and an observed dataset archive first.",
      );
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const observedSamples = probePaths.map((p) => ({
        terrain: manifest.terrain ?? "plains",
        sensor: manifest.sensor ?? "EO_optical",
        illumination: manifest.mean_illumination ?? 0.75,
        image_path: p,
      }));
      const result = await AssuranceApiClient.evaluateDistributionShift({
        referenceProfile: manifest.raw,
        observedSamples,
        declaredReferenceId:
          manifest.declared_reference_id ?? "declared_reference_baseline",
        observedDatasetId: datasetFileName ?? "observed_dataset",
      });
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setManifest(null);
    setManifestFileName(null);
    setDatasetFileName(null);
    setProbePaths(null);
    setReport(undefined);
    setError(null);
    if (manifestInputRef.current) manifestInputRef.current.value = "";
    if (datasetInputRef.current) datasetInputRef.current.value = "";
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>OPERATIONAL DOMAIN RADAR</span>
            <span>•</span>
            <span className="text-slate-700 font-semibold">
              COVARIATE SHIFT
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Distribution Shift & Drift Radar
          </h1>
          <p className="text-xs text-slate-500">
            Compare observed operational datasets against declared reference
            baselines to arbitrate drift vs. adversarial manipulation.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-700 font-medium">
              FR-11 Envelope Audit
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-mono">
            <Radio className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-slate-700 font-medium">
              FR-12 Arbitration
            </span>
          </div>
        </div>
      </div>

      {/* Inputs Configuration Card */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Evaluation Inputs
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Baseline vs. Observed Batch
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Declared Reference Manifest */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
                  <FileJson className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase font-mono">
                    1. Reference Manifest
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Declared baseline profile (.json)
                  </p>
                </div>
              </div>
              {manifest && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="h-3 w-3" /> Loaded
                </span>
              )}
            </div>

            <input
              ref={manifestInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleManifestFile(e.target.files[0])
              }
            />

            <button
              type="button"
              onClick={() => manifestInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              <span>
                {manifestFileName ?? "Select reference_manifest.json"}
              </span>
            </button>

            {manifest ? (
              <div className="rounded-lg bg-white border border-slate-200/80 p-3 text-xs space-y-1 font-mono">
                <div className="text-slate-900 font-semibold truncate">
                  {manifest.declared_reference_id}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                  <span>Terrain: {manifest.terrain ?? "plains"}</span>
                  <span>•</span>
                  <span>Sensor: {manifest.sensor ?? "EO_optical"}</span>
                  {manifest.mean_illumination != null && (
                    <>
                      <span>•</span>
                      <span>Lux: {manifest.mean_illumination}</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 font-mono">
                Operator-enrolled operational envelope baseline.
              </p>
            )}
          </div>

          {/* Card 2: Observed Dataset Archive */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                  <FileArchive className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase font-mono">
                    2. Observed Dataset
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Deployment batch archive (.zip)
                  </p>
                </div>
              </div>
              {probePaths && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </span>
              )}
            </div>

            <input
              ref={datasetInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleDatasetFile(e.target.files[0])
              }
            />

            <button
              type="button"
              disabled={analyzingDataset}
              onClick={() => datasetInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 disabled:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              {analyzingDataset ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                  <span>Extracting & resolving samples...</span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    {datasetFileName ?? "Upload observed dataset .zip"}
                  </span>
                </>
              )}
            </button>

            {probePaths ? (
              <div className="rounded-lg bg-white border border-slate-200/80 p-3 text-xs space-y-1 font-mono">
                <div className="text-slate-900 font-semibold truncate">
                  {datasetFileName}
                </div>
                <div className="text-[11px] text-slate-500">
                  {probePaths.length} probe image samples extracted for feature
                  comparison.
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 font-mono">
                Accepts COCO or YOLO formatted image batch archives.
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 font-mono">
            Status:{" "}
            {manifest && probePaths
              ? "All inputs loaded. Ready to run."
              : !manifest
                ? "Awaiting reference manifest JSON."
                : "Awaiting observed dataset ZIP archive."}
          </div>

          <div className="flex items-center gap-2">
            {(manifest || datasetFileName || report) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={runEvaluation}
              disabled={running || !manifest || !probePaths}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Computing Distribution Delta...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>Run Drift Evaluation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs text-rose-700">
            {error}
          </div>
        )}
      </div>

      {/* Report Result Section */}
      <DistributionShiftView report={report} />
    </div>
  );
};
