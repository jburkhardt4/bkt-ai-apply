/**
 * prospector-cron response contract + outcome classifier.
 *
 * Mirrors the JSON body returned by supabase/functions/prospector-cron and
 * reduces it to a single user-facing toast outcome. Kept in its own module
 * (not colocated in ProspectorDashboard.tsx) so it can be exported and
 * unit-tested without tripping the react-refresh/only-export-components rule,
 * and verified without a DOM environment.
 */

/** Status values come from the Edge Function's RunStats.status union. */
export type ProspectorRunStatusValue = 'success' | 'empty' | 'partial' | 'error'

export interface ProspectorRunProfileResult {
  profile_id: string
  status: ProspectorRunStatusValue
  jobs_found: number
  jobs_queued: number
}

export interface ProspectorRunResponse {
  message?: string
  profiles_processed?: number
  results?: ProspectorRunProfileResult[]
}

export type RunOutcomeKind = 'error' | 'empty' | 'success'

export interface RunOutcome {
  kind: RunOutcomeKind
  message: string
}

/**
 * Classifies a parsed prospector-cron response body into a single user-facing
 * outcome. Pure + side-effect-free.
 *
 * Precedence:
 *   1. any result with status 'error'        → error
 *   2. no results, or every result 'empty'   → empty (no new jobs)
 *   3. otherwise                             → success (sum jobs_queued);
 *      a soft note is appended when any result was 'partial'.
 */
export function summarizeRunResults(data: ProspectorRunResponse | null): RunOutcome {
  const results = data?.results ?? []

  if (results.some((r) => r.status === 'error')) {
    return {
      kind: 'error',
      message: 'Some searches failed. Please try again.',
    }
  }

  if (results.length === 0 || results.every((r) => r.status === 'empty')) {
    return { kind: 'empty', message: 'No new jobs found' }
  }

  const totalQueued = results.reduce((sum, r) => sum + (r.jobs_queued ?? 0), 0)
  const hasPartial = results.some((r) => r.status === 'partial')

  const base = `Added ${totalQueued} new job${totalQueued === 1 ? '' : 's'}`
  return {
    kind: 'success',
    message: hasPartial ? `${base} (some searches were incomplete)` : base,
  }
}
