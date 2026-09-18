"use client";

import React, { useEffect, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  Shield,
  FileText,
  Clock,
  Ban,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";

interface AssessmentAssetsViewProps {
  onUploadNew?: () => void;
  onViewDatasetDetails?: (analysisId: string) => void;
  onViewModelDetails?: (modelId: string) => void;
}

function truncateHash(hash: unknown): string {
  const s = typeof hash === "string" ? hash : "";
  return s ? `${s.slice(0, 12)}...` : "--";
}

export const AssessmentAssetsView: React.FC<AssessmentAssetsViewProps> = ({
  onUploadNew,
  onViewDatasetDetails,
  onViewModelDetails,
}) => {
  const [models, setModels] = useState<Array<Record<string, unknown>> | null>(null);
  const [datasets, setDatasets] = useState<Array<Record<string, unknown>> | null>(null);
  const [inferenceRecords, setInferenceRecords] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      AssuranceApiClient.listModelRecords(25),
      AssuranceApiClient.listDatasetAnalyses(25),
      AssuranceApiClient.listInferenceRecords(10),
    ])
      .then(([m, d, i]) => {
        if (!isMounted) return;
        setModels(m);
        setDatasets(d);
        setInferenceRecords(i);
      })
      .catch((e) => {
        if (isMounted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const loading = models === null || datasets === null || inferenceRecords === null;

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Asset Inventory
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Every model, dataset, and inference record persisted by this station.
          </p>
        </div>

        <button
          onClick={onUploadNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-mono text-xs font-bold transition-colors shadow-2xs cursor-pointer"
        >
          <UploadCloud className="h-3.5 w-3.5 text-slate-700" />
          <span>UPLOAD NEW ASSET</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-700 font-mono">
          Could not load asset inventory: {error}
        </div>
      )}

      {loading && !error && (
        <div className="rounded-xl border border-slate-200/90 bg-white p-10 text-center shadow-xs">
          <p className="text-sm text-slate-500">Loading asset inventory…</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Datasets */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 uppercase tracking-wide">
                <span className="h-3.5 w-3.5 rounded bg-slate-900 text-white flex items-center justify-center text-[9px]">▦</span>
                <span>DATASETS</span>
              </div>
              <span className="font-mono text-xs text-slate-400">{datasets!.length} analyzed</span>
            </div>
            {datasets!.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                No datasets analyzed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-100 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-5">DATASET ID</th>
                      <th className="py-3 px-5">FORMAT</th>
                      <th className="py-3 px-5">IMAGES</th>
                      <th className="py-3 px-5">FINDINGS</th>
                      <th className="py-3 px-5">LABEL VERIFICATION</th>
                      <th className="py-3 px-5">ANALYZED</th>
                      <th className="py-3 px-5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {datasets!.map((d) => (
                      <tr key={String(d.analysis_id)} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-5 font-bold text-slate-900">{String(d.dataset_id)}</td>
                        <td className="py-3.5 px-5 text-slate-700">{String(d.format)}</td>
                        <td className="py-3.5 px-5 text-slate-700">{String(d.total_images)}</td>
                        <td className="py-3.5 px-5">
                          <span
                            className={
                              Number(d.finding_count) > 0
                                ? "text-rose-600 font-bold"
                                : "text-emerald-600 font-bold"
                            }
                          >
                            {String(d.finding_count)}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-slate-500">{String(d.label_verification_method || "--")}</td>
                        <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap">
                          {String(d.created_at).replace("T", " ").replace("Z", "")}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            onClick={() => onViewDatasetDetails && onViewDatasetDetails(String(d.analysis_id))}
                            className="text-slate-700 hover:text-slate-900 hover:underline text-xs font-bold cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Models */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 uppercase tracking-wide">
                <span className="text-sky-600">⚙</span>
                <span>MODEL WEIGHTS</span>
              </div>
              <span className="font-mono text-xs text-slate-400">{models!.length} fingerprinted</span>
            </div>
            {models!.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                No models fingerprinted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-100 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-5">NAME</th>
                      <th className="py-3 px-5">FORMAT</th>
                      <th className="py-3 px-5">ACCESS LEVEL</th>
                      <th className="py-3 px-5">SHA-256</th>
                      <th className="py-3 px-5">STATUS</th>
                      <th className="py-3 px-5">FINGERPRINTED</th>
                      <th className="py-3 px-5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {models!.map((m) => {
                      const verified = String(m.verification_status).toUpperCase() === "VERIFIED";
                      return (
                        <tr key={String(m.model_id)} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-slate-900">{String(m.model_name)}</td>
                          <td className="py-3.5 px-5 text-slate-700">{String(m.model_format)}</td>
                          <td className="py-3.5 px-5 text-slate-700">{String(m.access_level)}</td>
                          <td className="py-3.5 px-5 text-sky-700">{truncateHash(m.sha256_digest)}</td>
                          <td className="py-3.5 px-5">
                            <span
                              className={
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                                (verified
                                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                  : "bg-slate-100 border border-slate-200 text-slate-600")
                              }
                            >
                              {verified ? <CheckCircle2 className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                              {String(m.verification_status)}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap">
                            {String(m.created_at).replace("T", " ").replace("Z", "")}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => onViewModelDetails && onViewModelDetails(String(m.model_id))}
                              className="text-slate-700 hover:text-slate-900 hover:underline text-xs font-bold cursor-pointer"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inference Records */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 uppercase tracking-wide">
                <span className="text-sky-600 font-mono">{`{ }`}</span>
                <span>INFERENCE RECORDS</span>
              </div>
              <span className="font-mono text-xs text-slate-400">{inferenceRecords!.length} signed (latest 10)</span>
            </div>

            {inferenceRecords!.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                No provenance-signed inference records yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-100 font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-5">RECORD ID</th>
                      <th className="py-3 px-5">MODEL</th>
                      <th className="py-3 px-5">IMAGE HASH</th>
                      <th className="py-3 px-5">INTEGRITY</th>
                      <th className="py-3 px-5">TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {inferenceRecords!.map((r) => {
                      const tampered = Boolean(r.tampering_detected);
                      const valid = Boolean(r.is_valid);
                      return (
                        <tr key={String(r.record_id)} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span>{String(r.record_id)}</span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-700">{String(r.model_id)}</td>
                          <td className="py-3.5 px-5 text-slate-600">{truncateHash(r.image_hash)}</td>
                          <td className="py-3.5 px-5">
                            <span
                              className={
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                                (tampered || !valid
                                  ? "bg-rose-50 border border-rose-200 text-rose-600"
                                  : "bg-emerald-50 border border-emerald-200 text-emerald-700")
                              }
                            >
                              {tampered || !valid ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                              {tampered ? "TAMPERED" : valid ? "VALID" : "INVALID"}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {String(r.created_at).replace("T", " ").replace("Z", "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
