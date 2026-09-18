import React, { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, RefreshCw } from 'lucide-react'
import { AssuranceApiClient } from '@/client/lib/api-client'
import { TrendSummary } from '@/shared/types/assurance'
import { StatCard } from '../ui/StatCard'
import { StatusBadge } from '../ui/StatusBadge'

const CHART_WIDTH = 720
const CHART_HEIGHT = 160
const CHART_PAD = 24

export const TrendDashboardView: React.FC = () => {
  const [data, setData] = useState<TrendSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrends = () => {
    return AssuranceApiClient.getTrends()
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  const handleRefresh = () => {
    setLoading(true)
    fetchTrends()
  }

  useEffect(() => { fetchTrends() }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-12 text-center text-xs text-zinc-400 space-y-3">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        <div>LOADING HISTORICAL TREND DATA...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-6 text-xs text-rose-300">
        Failed to load trends: {error}
      </div>
    )
  }

  if (data.total_reports === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-12 text-center text-xs text-zinc-400 space-y-2">
        <div>No assurance reports have been generated yet.</div>
        <div>Run a scenario or a live analysis to populate this dashboard.</div>
      </div>
    )
  }

  const scores = data.timeline.map((t) => t.overall_risk_score)
  const maxScore = Math.max(100, ...scores)
  const points = data.timeline.map((t, i) => {
    const x = CHART_PAD + (i / Math.max(1, data.timeline.length - 1)) * (CHART_WIDTH - CHART_PAD * 2)
    const y = CHART_HEIGHT - CHART_PAD - (t.overall_risk_score / maxScore) * (CHART_HEIGHT - CHART_PAD * 2)
    return { x, y, t }
  })
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  const toneForDisposition = (d: string) => (d === 'ACCEPT' ? '#34d399' : d === 'REVIEW' ? '#fbbf24' : '#fb7185')

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          Historical Assurance Trends
        </h3>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" /> REFRESH
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Reports" value={String(data.total_reports)} subtitle="All persisted assurance runs" icon={<BarChart3 className="h-4 w-4" />} tone="cyan" />
        <StatCard title="Accept" value={String(data.disposition_counts.ACCEPT || 0)} subtitle="Low risk dispositions" icon={<TrendingUp className="h-4 w-4" />} tone="emerald" />
        <StatCard title="Review" value={String(data.disposition_counts.REVIEW || 0)} subtitle="Medium risk dispositions" icon={<TrendingUp className="h-4 w-4" />} tone="amber" />
        <StatCard title="Quarantine" value={String(data.disposition_counts.QUARANTINE || 0)} subtitle="High risk dispositions" icon={<TrendingUp className="h-4 w-4" />} tone="rose" />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2">
          Risk Score Over Time ({data.timeline.length} reports)
        </div>
        <div className="overflow-x-auto">
          <svg width={CHART_WIDTH} height={CHART_HEIGHT} className="min-w-full">
            <line x1={CHART_PAD} y1={CHART_HEIGHT - CHART_PAD} x2={CHART_WIDTH - CHART_PAD} y2={CHART_HEIGHT - CHART_PAD} stroke="#3f3f46" strokeWidth={1} />
            <line x1={CHART_PAD} y1={CHART_PAD} x2={CHART_PAD} y2={CHART_HEIGHT - CHART_PAD} stroke="#3f3f46" strokeWidth={1} />
            <polyline points={polyline} fill="none" stroke="#22d3ee" strokeWidth={1.5} opacity={0.6} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill={toneForDisposition(p.t.overall_disposition)}>
                <title>{`${p.t.report_id}: ${p.t.overall_risk_score.toFixed(1)} (${p.t.overall_disposition}) @ ${p.t.generated_at}`}</title>
              </circle>
            ))}
          </svg>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Accept</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Review</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Quarantine</span>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-400" /> Contributor Risk Trend (aggregated across all runs)
        </div>
        {data.contributor_trends.length === 0 ? (
          <div className="text-xs text-zinc-500 py-4 text-center">No contributor metadata found in any persisted report.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="py-1.5 pr-4">Contributor</th>
                  <th className="py-1.5 pr-4">Appearances</th>
                  <th className="py-1.5 pr-4">Avg Risk Score</th>
                  <th className="py-1.5 pr-4">Max Severity</th>
                  <th className="py-1.5 pr-4">Quarantine Count</th>
                </tr>
              </thead>
              <tbody>
                {data.contributor_trends.map((c) => (
                  <tr key={c.contributor_id} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-1.5 pr-4 font-semibold text-zinc-200">{c.contributor_id}</td>
                    <td className="py-1.5 pr-4">{c.appearances}</td>
                    <td className="py-1.5 pr-4">{c.avg_risk_score.toFixed(1)}</td>
                    <td className="py-1.5 pr-4"><StatusBadge status={c.max_risk_level} size="sm" /></td>
                    <td className="py-1.5 pr-4">{c.quarantine_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
