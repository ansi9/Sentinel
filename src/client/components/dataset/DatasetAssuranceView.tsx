import React from 'react'
import { AlertTriangle, Copy, FileText, Layers, Radio, ShieldAlert } from 'lucide-react'
import { ContributorRiskSummary, FindingSchema } from '@/shared/types/assurance'
import { StatusBadge } from '../ui/StatusBadge'
import { StatCard } from '../ui/StatCard'

interface DatasetAssuranceViewProps {
  findings: FindingSchema[]
  contributorSummaries: ContributorRiskSummary[]
  samplesCount: number
}

export const DatasetAssuranceView: React.FC<DatasetAssuranceViewProps> = ({
  findings,
  contributorSummaries,
  samplesCount,
}) => {
  const datasetFindings = findings.filter(f => f.asset_type === 'dataset')

  const dupFindings = datasetFindings.filter(f => f.finding_type === 'near_duplicate_flooding')
  const labelFindings = datasetFindings.filter(f => f.finding_type === 'label_flipping' || f.finding_type === 'systematic_mislabelling')
  const triggerFindings = datasetFindings.filter(f => f.finding_type === 'trigger_injection')
  const oodFindings = datasetFindings.filter(f => f.finding_type === 'ood_insertion')

  return (
    <div className="space-y-6 font-mono">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Samples Ingested"
          value={samplesCount}
          subtitle="COCO / YOLO Formats"
          icon={<Layers className="h-4 w-4" />}
          tone="cyan"
        />
        <StatCard
          title="Duplicate Clusters"
          value={dupFindings.length}
          subtitle={dupFindings.length > 0 ? "Flooding Attack Detected" : "Zero Redundant Batches"}
          icon={<Copy className="h-4 w-4" />}
          tone={dupFindings.length > 0 ? "rose" : "emerald"}
        />
        <StatCard
          title="Label Discrepancies"
          value={labelFindings.length}
          subtitle={labelFindings.length > 0 ? "Systematic Error Clusters" : "Consistent Annotations"}
          icon={<FileText className="h-4 w-4" />}
          tone={labelFindings.length > 0 ? "amber" : "emerald"}
        />
        <StatCard
          title="Trigger / OOD Anomalies"
          value={triggerFindings.length + oodFindings.length}
          subtitle={triggerFindings.length > 0 ? "Spatial Trojan Watermarks" : "Distribution Within Bounds"}
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={triggerFindings.length > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">
              Contributor-Level Aggregated Risk Index (FR-03)
            </h3>
          </div>
          <span className="text-xs text-zinc-400">
            Multi-Source Provenance & Sample Attribution
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="pb-2.5 font-semibold">Contributor Source</th>
                <th className="pb-2.5 font-semibold text-center">Total Samples</th>
                <th className="pb-2.5 font-semibold text-center">Duplicates</th>
                <th className="pb-2.5 font-semibold text-center">Label Flips</th>
                <th className="pb-2.5 font-semibold text-center">Triggers</th>
                <th className="pb-2.5 font-semibold text-center">OOD</th>
                <th className="pb-2.5 font-semibold text-center">Risk Score</th>
                <th className="pb-2.5 font-semibold text-right">Disposition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {contributorSummaries.map((c) => (
                <tr key={c.contributor_id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3 font-bold text-zinc-200 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    {c.contributor_id}
                  </td>
                  <td className="py-3 text-center text-zinc-300">{c.total_samples}</td>
                  <td className="py-3 text-center text-zinc-300 font-semibold">{c.near_duplicates}</td>
                  <td className="py-3 text-center text-zinc-300 font-semibold">{c.label_anomalies}</td>
                  <td className="py-3 text-center text-zinc-300 font-semibold">{c.trigger_suspects}</td>
                  <td className="py-3 text-center text-zinc-300 font-semibold">{c.ood_samples}</td>
                  <td className="py-3 text-center">
                    <span className="font-bold text-zinc-100">{c.risk_score.toFixed(1)}/100</span>
                  </td>
                  <td className="py-3 text-right">
                    <StatusBadge status={c.recommended_action} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">
            Dataset Integrity Findings & Empirical Evidence (FR-02 & FR-13)
          </h3>
        </div>

        {datasetFindings.length === 0 ? (
          <div className="mt-4 rounded border border-emerald-900/40 bg-emerald-950/20 p-6 text-center text-xs text-emerald-300">
            ✓ ZERO DATASET ANOMALIES DETECTED. ALL INGESTED SAMPLES PASS COCO/YOLO INTEGRITY ASSURANCE.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {datasetFindings.map((f) => (
              <div key={f.finding_id} className="rounded border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">{f.finding_id}</span>
                    <span className="text-zinc-500">|</span>
                    <span className="text-xs uppercase text-zinc-400 font-semibold">{f.finding_type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.severity} size="sm" />
                    <StatusBadge status={f.recommended_action} size="sm" />
                  </div>
                </div>

                <p className="text-xs text-zinc-300">{f.reason}</p>

                <div className="rounded bg-zinc-950 p-2 text-[11px] text-zinc-400 border border-zinc-800/80">
                  <div className="text-zinc-500 font-semibold mb-1">EVIDENCE RECORD:</div>
                  <pre className="text-[10px] text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(f.evidence, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
