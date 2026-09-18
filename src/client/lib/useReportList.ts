import { useEffect, useState } from 'react'
import { AssuranceApiClient, StoredReportSummary } from '@/client/lib/api-client'
import { AssuranceReport } from '@/shared/types/assurance'

export interface ReportCardData {
  summary: StoredReportSummary
  report: AssuranceReport | null
}

/** Shared data source for every screen that lists persisted assessments
 * (Home's "needs attention" triage and the full Reports history) --  one
 * fetch-and-hydrate implementation instead of two, since both need the
 * same thing: every report summary plus its full body (for severity
 * counts and drill-down). */
export function useReportList(limit = 100) {
  const [cards, setCards] = useState<ReportCardData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isMounted = true
    ;(async () => {
      try {
        const summaries = await AssuranceApiClient.listReportSummaries(limit)
        if (!isMounted) return
        const withDetail = await Promise.all(
          summaries.map(async (summary) => {
            try {
              const report = await AssuranceApiClient.getReportById(summary.report_id)
              return { summary, report }
            } catch {
              return { summary, report: null }
            }
          })
        )
        if (isMounted) setCards(withDetail)
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      isMounted = false
    }
  }, [limit, reloadToken])

  const reload = () => setReloadToken((t) => t + 1)

  return { cards, error, reload }
}
