"use client";

import React from "react";
import clsx from "clsx";
import {
  Compass,
  Sun,
  Mountain,
  Radio,
  Layers,
  Inbox,
  Cpu,
} from "lucide-react";
import { DistributionShiftReport } from "@/shared/types/assurance";
import { StatusBadge } from "../ui/StatusBadge";

interface DistributionShiftViewProps {
  report?: DistributionShiftReport;
}

const PRIMARY_DIMENSIONS = new Set([
  "terrain_shift",
  "sensor_divergence",
  "illumination_delta",
]);

const DIMENSION_LABELS: Record<string, string> = {
  seasonal_variance: "Seasonal Variance",
  blur_shift: "Blur Shift",
  contrast_shift: "Contrast Shift",
  resolution_shift: "Resolution Shift",
  compression_artifact_shift: "Compression Artifacts",
  embedding_shift: "Embedding-Space Shift",
};

const KPI_TONE_CLASSES = {
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof KPI_TONE_CLASSES;
  value: string | number;
  label: string;
  sub: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  tone,
  value,
  label,
  sub,
}) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
    <div
      className={clsx(
        "flex h-12 w-12 items-center justify-center rounded-xl shrink-0",
        KPI_TONE_CLASSES[tone],
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold text-slate-900 tracking-tight font-sans truncate">
        {value}
      </div>
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
        {sub}
      </div>
    </div>
  </div>
);

export const DistributionShiftView: React.FC<DistributionShiftViewProps> = ({
  report,
}) => {
  if (!report) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-12 text-center space-y-3 font-sans">
        <div className="mx-auto h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
          <Inbox className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Awaiting Distribution Shift Evaluation
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Provide a declared reference baseline and observed dataset archive
            above to evaluate domain delta, sensor noise, and environmental
            drift.
          </p>
        </div>
      </div>
    );
  }

  const dims = report.affected_dimensions || {};
  const overallScore = (report.overall_drift_score * 100).toFixed(1);
  const isDrift = report.drift_detected;
  const statusStr = isDrift ? "ANOMALIES_DETECTED" : "NORMAL";

  const additionalDimensions = Object.entries(dims).filter(
    ([key]) => !PRIMARY_DIMENSIONS.has(key),
  );
  const embeddingEvidence = report.image_quality_evidence
    ?.embedding_comparison as Record<string, number> | undefined;

  return (
    <div className="space-y-6 font-sans">
      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Mountain}
          tone={dims.terrain_shift > 0.3 ? "rose" : "sky"}
          value={`${((dims.terrain_shift || 0) * 100).toFixed(1)}%`}
          label="Terrain Shift"
          sub="Declared geography delta"
        />
        <MetricCard
          icon={Radio}
          tone={dims.sensor_divergence > 0.3 ? "rose" : "emerald"}
          value={`${((dims.sensor_divergence || 0) * 100).toFixed(1)}%`}
          label="Sensor Divergence"
          sub="Spectrum & modality profile"
        />
        <MetricCard
          icon={Sun}
          tone={dims.illumination_delta > 0.3 ? "amber" : "emerald"}
          value={`${((dims.illumination_delta || 0) * 100).toFixed(1)}%`}
          label="Illumination Delta"
          sub="Solar angle & lighting variance"
        />
        <MetricCard
          icon={Compass}
          tone={isDrift ? "rose" : "emerald"}
          value={`${overallScore}%`}
          label={isDrift ? "Anomalous Drift" : "Within Envelope"}
          sub={`Confidence: ${(report.confidence * 100).toFixed(1)}%`}
        />
      </div>

      {/* Additional Signal Dimensions (if present) */}
      {additionalDimensions.length > 0 && (
        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Layers className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Additional Signal Dimensions
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {additionalDimensions.map(([key, value]) => (
              <div
                key={key}
                className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3.5"
              >
                <div className="text-[10px] uppercase text-slate-500 font-semibold font-mono">
                  {DIMENSION_LABELS[key] || key.replace(/_/g, " ")}
                </div>
                <div
                  className={clsx(
                    "text-lg font-bold font-sans mt-1",
                    value > 0.5 ? "text-rose-600" : "text-slate-900",
                  )}
                >
                  {(value * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          {embeddingEvidence && (
            <div className="rounded-lg border border-sky-200/70 bg-sky-50/40 p-4 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-sky-900 font-semibold uppercase text-[11px] font-mono">
                <Cpu className="h-3.5 w-3.5 text-sky-600" />
                <span>
                  CNN Embedding-Space Comparison (32-dim Frechet Distance)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-600 font-mono text-[11px] pt-1">
                <div>
                  <span className="text-slate-400">Reference Samples: </span>
                  <span className="font-bold text-slate-800">
                    {embeddingEvidence.reference_samples_embedded}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Observed Samples: </span>
                  <span className="font-bold text-slate-800">
                    {embeddingEvidence.observed_samples_embedded}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Frechet Distance: </span>
                  <span className="font-bold text-slate-800">
                    {embeddingEvidence.embedding_frechet_distance}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Embedding Dim: </span>
                  <span className="font-bold text-slate-800">
                    {embeddingEvidence.embedding_dim}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Operational Envelope & Arbitration Radar */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Drift vs. Manipulation Arbitration
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={statusStr} size="sm" />
            <StatusBadge status={report.classification} size="sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Declared Envelope */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="text-slate-700 font-semibold uppercase text-[11px] font-mono">
              Declared Operational Envelope
            </div>
            <div className="divide-y divide-slate-200/70 text-slate-700 font-mono text-xs">
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Baseline Reference:</span>
                <span className="font-semibold text-slate-900">
                  {report.declared_reference_id}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Observed Dataset:</span>
                <span className="font-semibold text-slate-900">
                  {report.observed_dataset_id}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Suspected Mechanism:</span>
                <span className="font-semibold text-sky-700">
                  {report.suspected_cause}
                </span>
              </div>
            </div>
          </div>

          {/* Arbitration Reasoning */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="text-slate-700 font-semibold uppercase text-[11px] font-mono">
              Arbitration Verdict (FR-12)
            </div>
            <p className="text-slate-700 leading-relaxed text-xs">
              {report.characterization}
            </p>
            <div className="rounded-md bg-white p-3 text-xs text-slate-600 border border-slate-200/80">
              <span className="font-semibold text-slate-800 font-mono text-[11px]">
                REASONING:{" "}
              </span>
              <span>{report.reasoning}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
