import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import { ContributorRiskSummary, FindingSchema, FindingSeverity } from '@/shared/types/assurance'
import { StatusBadge } from '@/client/components/ui/StatusBadge'

// Evidence keys, across every detector in this system, that carry a list
// of individual sample/probe records worth showing as a table rather than
// raw JSON -- this is the "Finding -> Affected samples" step of the
// investigation chain.
const SAMPLE_LIST_KEYS = [
  'sample_records',
  'sample_discrepancies',
  'sample_trigger_records',
  'deviant_probes',
  'trigger_flips_sample',
]

function findSampleList(evidence: Record<string, unknown>): { key: string; rows: Record<string, unknown>[] } | null {
  for (const key of SAMPLE_LIST_KEYS) {
    const val = evidence[key]
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
      return { key, rows: val as Record<string, unknown>[] }
    }
  }
  return null
}

function findSampleIdList(evidence: Record<string, unknown>): string[] | null {
  const val = evidence['sample_ids']
  if (Array.isArray(val) && val.every((v) => typeof v === 'string')) return val as string[]
  return null
}

/** Every FindingSchema.evidence dict in this system that names a
 * contributor does so via `affected_source` (a comma-joined string of
 * contributor ids) or an `affected_contributors` list inside `evidence`.
 * Resolving those ids against the report's own contributor_summaries
 * (already fetched, no extra API call) realizes the "Finding -> affected
 * samples -> Contributor -> Contributor risk" chain the analyst should be
 * able to follow without a separate Contributor page. */
function resolveContributors(
  finding: FindingSchema,
  contributorSummaries: ContributorRiskSummary[]
): ContributorRiskSummary[] {
  if (contributorSummaries.length === 0) return []
  const ids = new Set<string>()
  if (finding.affected_source) {
    for (const part of finding.affected_source.split(',')) {
      const trimmed = part.trim()
      if (trimmed) ids.add(trimmed)
    }
  }
  const evidenceContribs = finding.evidence['affected_contributors']
  if (Array.isArray(evidenceContribs)) {
    for (const c of evidenceContribs) if (typeof c === 'string') ids.add(c)
  }
  const primary = finding.evidence['primary_contributor']
  if (typeof primary === 'string') ids.add(primary)

  return contributorSummaries.filter((c) => ids.has(c.contributor_id))
}

const MAX_TABLE_COLUMNS = 6

/** Columns are derived from whatever keys the rows actually carry (in
 * first-appearance order, primitives only) rather than a hardcoded
 * allowlist -- every detector in this system names its per-sample fields
 * differently (probe_index/clean_prediction for backdoor trigger flips vs.
 * sample_id/z_score for OOD, etc.), so a fixed column list would render a
 * table with zero matching columns for whichever detector wasn't
 * anticipated. */
function deriveColumns(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.includes(key)) continue
      const v = row[key]
      if (v !== null && typeof v === 'object') continue // skip nested objects/arrays in a table cell
      seen.push(key)
      if (seen.length >= MAX_TABLE_COLUMNS) return seen
    }
  }
  return seen
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  return String(v)
}

// Evidence keys already rendered elsewhere (sample tables, contributor
// cross-reference) or too structural to read as a standalone "signal" --
// excluded so the signal list only shows the numbers/strings that
// actually explain WHY a finding fired.
const SIGNAL_EXCLUDE_KEYS = new Set([
  ...SAMPLE_LIST_KEYS,
  'sample_ids',
  'affected_contributors',
  'primary_contributor',
  'per_class_results',
  'flagged_class',
])

/** Pulls the handful of scalar evidence fields (a z-score, a mask L1 norm,
 * an attack success rate, ...) that are the actual quantitative signal
 * behind a finding, so the analyst sees "3 independent signals
 * contributed" instead of only the one-line `reason` string or a raw JSON
 * dump. */
function deriveSignals(evidence: Record<string, unknown>): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  for (const [key, val] of Object.entries(evidence)) {
    if (SIGNAL_EXCLUDE_KEYS.has(key)) continue
    if (val === null || val === undefined || typeof val === 'object') continue
    out.push({ label: key.replace(/_/g, ' '), value: formatCellValue(val) })
    if (out.length >= 5) break
  }
  return out
}

type EvidenceStrength = 'STRONG' | 'MODERATE' | 'LIMITED'

/** A finding's confidence score says how sure the detector is; evidence
 * strength says something different and equally important -- whether that
 * confidence rests on real, executed analysis of the actual asset, or on
 * contributor-declared metadata this system had no independent way to
 * verify. Every detector in this codebase that has such a distinction
 * names it explicitly (a `real_*` vs `*_declared_metadata*`/`*_only`
 * value in `detection_method`/`verification_method`/similar fields) --
 * this reads that signal rather than inferring it from confidence alone,
 * which would conflate "the detector is sure" with "the detector had
 * real evidence to be sure about". */
function deriveEvidenceStrength(finding: FindingSchema): { label: EvidenceStrength; reason: string } {
  // The real-vs-declared marker (detection_method/verification_method) is
  // sometimes on the finding's top-level evidence, sometimes nested one
  // level down inside a per-sample record list (e.g.
  // sample_trigger_records[i].detection_method) -- collect string values
  // from both so the signal isn't missed just because of where a
  // particular detector happened to attach it.
  const stringValues: string[] = []
  for (const val of Object.values(finding.evidence)) {
    if (typeof val === 'string') {
      stringValues.push(val)
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') {
          for (const nested of Object.values(item as Record<string, unknown>)) {
            if (typeof nested === 'string') stringValues.push(nested)
          }
        }
      }
    }
  }
  const hasWeakMarker = stringValues.some((v) => /declared|metadata_only/i.test(v))
  const hasStrongMarker = stringValues.some((v) => /^real_/i.test(v))
  const hasUnavailableLimitation = finding.limitations.some((l) => /unavailable/i.test(l))

  if (hasWeakMarker) {
    return { label: 'LIMITED', reason: 'Based on contributor-declared metadata, not independently verified against the real asset.' }
  }
  if (hasStrongMarker) {
    return { label: 'STRONG', reason: 'Based on real, executed analysis of the actual asset.' }
  }
  if (hasUnavailableLimitation) {
    return { label: 'LIMITED', reason: 'Some required analysis was unavailable under the declared access level.' }
  }
  return { label: 'MODERATE', reason: 'Derived from a single detector signal without an explicit real-vs-declared distinction.' }
}

interface FindingCardProps {
  finding: FindingSchema
  contributorSummaries: ContributorRiskSummary[]
}

const FindingCard: React.FC<FindingCardProps> = ({ finding, contributorSummaries }) => {
  const [expanded, setExpanded] = useState(false)
  const sampleList = useMemo(() => findSampleList(finding.evidence), [finding.evidence])
  const sampleIdList = useMemo(() => findSampleIdList(finding.evidence), [finding.evidence])
  const relatedContributors = useMemo(
    () => resolveContributors(finding, contributorSummaries),
    [finding, contributorSummaries]
  )

  const sampleColumns = sampleList ? deriveColumns(sampleList.rows) : []
  const signals = useMemo(() => deriveSignals(finding.evidence), [finding.evidence])
  const strength = useMemo(() => deriveEvidenceStrength(finding), [finding])
  const strengthTone = strength.label === 'STRONG' ? 'text-emerald-400' : strength.label === 'LIMITED' ? 'text-amber-400' : 'text-zinc-400'

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left cursor-pointer"
      >
        <div className="flex min-w-0 items-start gap-2">
          {expanded ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-200 break-words">{finding.reason}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500 break-all">
              {finding.asset_type} · {finding.asset} {finding.affected_source ? `· ${finding.affected_source}` : ''}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={clsx('text-[9px] font-bold uppercase tracking-wider', strengthTone)}>{strength.label}</span>
          <span className="text-[10px] text-zinc-500">{Math.round(finding.confidence * 100)}%</span>
          <StatusBadge status={finding.recommended_action} size="sm" />
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-zinc-800/70 px-3 py-3 text-xs">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Why This Was Flagged</div>
            {signals.length > 0 ? (
              <ul className="space-y-1">
                {signals.map((s) => (
                  <li key={s.label} className="flex items-center justify-between rounded bg-zinc-950 px-2.5 py-1 capitalize text-zinc-300">
                    <span>{s.label}</span>
                    <span className="font-bold tabular-nums text-zinc-100">{s.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-500">{finding.reason}</p>
            )}
            <div className={clsx('mt-1.5 text-[10px]', strengthTone)}>
              Evidence strength: {strength.label} — {strength.reason}
            </div>
          </div>

          {relatedContributors.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                <Users className="h-3 w-3" /> Related Contributor{relatedContributors.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-1.5">
                {relatedContributors.map((c) => (
                  <div
                    key={c.contributor_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5"
                  >
                    <span className="font-semibold text-zinc-300">{c.contributor_id}</span>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                      <span>{c.total_samples} samples</span>
                      <span>{c.suspicious_samples} suspicious</span>
                      <span className="font-bold text-zinc-200">risk {c.risk_score.toFixed(0)}</span>
                      <StatusBadge status={c.risk_level} size="sm" />
                      <StatusBadge status={c.recommended_action} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sampleList && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Affected Samples ({sampleList.rows.length})
              </div>
              <div className="mt-1 overflow-x-auto rounded border border-zinc-800">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-500">
                      {sampleColumns.map((col) => (
                        <th key={col} className="px-2 py-1 text-left font-semibold uppercase tracking-wider">
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleList.rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-zinc-900 last:border-0">
                        {sampleColumns.map((col) => (
                          <td key={col} className="px-2 py-1 text-zinc-400">
                            {formatCellValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sampleList.rows.length > 10 && (
                  <div className="px-2 py-1 text-[10px] text-zinc-600">
                    +{sampleList.rows.length - 10} more (see raw evidence below)
                  </div>
                )}
              </div>
            </div>
          )}

          {!sampleList && sampleIdList && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Affected Samples ({sampleIdList.length})
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {sampleIdList.slice(0, 20).map((id) => (
                  <span key={id} className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {id}
                  </span>
                ))}
                {sampleIdList.length > 20 && (
                  <span className="text-[10px] text-zinc-600">+{sampleIdList.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
              Raw evidence
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-400">
              {JSON.stringify(finding.evidence, null, 2)}
            </pre>
          </details>

          {finding.access_assumptions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Access Assumptions</div>
              <ul className="mt-1 list-inside list-disc text-zinc-400">
                {finding.access_assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {finding.limitations.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Limitations</div>
              <ul className="mt-1 list-inside list-disc text-zinc-400">
                {finding.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface FindingsTriageProps {
  findings: FindingSchema[]
  contributorSummaries?: ContributorRiskSummary[]
}

/** Directs attention where it matters: CRITICAL/HIGH findings are always
 * visible; MEDIUM/LOW collapse behind a single "show N more" toggle so 40
 * low-severity findings don't bury the 2 that actually require a
 * decision. Expanding a finding also drills into its affected samples and
 * cross-references any named contributor against the report's own
 * contributor risk summaries -- no separate Samples/Contributor page
 * needed. */
export const FindingsTriage: React.FC<FindingsTriageProps> = ({ findings, contributorSummaries = [] }) => {
  const [showMinor, setShowMinor] = useState(false)

  const grouped = useMemo(() => {
    const g: Record<FindingSeverity, FindingSchema[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] }
    for (const f of findings) g[f.severity].push(f)
    return g
  }, [findings])

  const majorSeverities: FindingSeverity[] = ['CRITICAL', 'HIGH']
  const minorSeverities: FindingSeverity[] = ['MEDIUM', 'LOW']
  const majorFindings = majorSeverities.flatMap((s) => grouped[s])
  const minorFindings = minorSeverities.flatMap((s) => grouped[s])

  if (findings.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-6 text-center text-xs text-zinc-500">
        No findings raised for this assessment.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {majorFindings.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-rose-400 font-bold">
            Immediate Attention ({majorFindings.length})
          </div>
          <div className="space-y-2">
            {majorFindings.map((f) => (
              <FindingCard key={f.finding_id} finding={f} contributorSummaries={contributorSummaries} />
            ))}
          </div>
        </div>
      )}

      {minorFindings.length > 0 && (
        <div>
          <button
            onClick={() => setShowMinor((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 cursor-pointer'
            )}
          >
            {showMinor ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showMinor ? 'Hide' : 'Show'} {minorFindings.length} medium/low finding{minorFindings.length === 1 ? '' : 's'}
          </button>
          {showMinor && (
            <div className="mt-2 space-y-2">
              {minorFindings.map((f) => (
                <FindingCard key={f.finding_id} finding={f} contributorSummaries={contributorSummaries} />
              ))}
            </div>
          )}
        </div>
      )}

      {majorFindings.length === 0 && minorFindings.length === 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-6 text-center text-xs text-zinc-500">
          No findings raised for this assessment.
        </div>
      )}
    </div>
  )
}
