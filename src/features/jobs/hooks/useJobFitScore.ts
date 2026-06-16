/**
 * useJobFitScore
 *
 * Loads the latest AI fit score for a single open job so the Prospector job
 * sheet can surface a match score + fit summary BEFORE the user clicks Apply.
 * Data-hook pattern (component-patterns.md): over the single Supabase client,
 * returns { data, loading, error }; no React Query.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient() (single client)
 *   BR-005 — every query filters by user_id (ai_scores is RLS-scoped too)
 *   BR-008 — auth state via useAuth() only (caller passes the resolved userId)
 *   BR-141 — reasoning_trace.source === 'heuristic_fallback' (reason 'cost_cap')
 *            marks an estimated/queued score (full AI scoring deferred, BR-052)
 *
 * react-hooks/set-state-in-effect: state is set ONLY inside the promise
 * callbacks, guarded by a `cancelled` flag in the effect cleanup. No synchronous
 * setState in the effect body (mirrors useProspectorProfile).
 */

import { useEffect, useState } from 'react'
import { getSupabaseClientSafe } from '@/lib/supabase'
import type { JobFitState } from '../components/jobFitPanel.helpers'

export interface JobFitScoreData {
  state: JobFitState
  score: number | null
  recommendation: 'apply' | 'consider' | 'reject' | null
  matched: string[]
  missing: string[]
}

export interface UseJobFitScoreResult {
  data: JobFitScoreData
  loading: boolean
  error: string | null
}

interface AiScoreRow {
  overall_score: number
  strengths: string[] | null
  gaps: string[] | null
  recommendation: string | null
  reasoning_trace: Record<string, unknown> | null
}

const UNSCORED: JobFitScoreData = {
  state: 'unscored',
  score: null,
  recommendation: null,
  matched: [],
  missing: [],
}

function toRecommendation(value: string | null): 'apply' | 'consider' | 'reject' | null {
  return value === 'apply' || value === 'consider' || value === 'reject' ? value : null
}

/** A heuristic fallback persisted because the monthly cap was reached (BR-052 /
 *  BR-104) is surfaced as 'queued' (estimated). Other fallbacks are real scores. */
function isCostCapped(trace: Record<string, unknown> | null): boolean {
  return trace?.source === 'heuristic_fallback' && trace?.reason === 'cost_cap'
}

function mapRow(row: AiScoreRow): JobFitScoreData {
  if (isCostCapped(row.reasoning_trace)) {
    return {
      state: 'queued',
      score: row.overall_score,
      recommendation: toRecommendation(row.recommendation),
      matched: row.strengths ?? [],
      missing: row.gaps ?? [],
    }
  }
  return {
    state: 'ready',
    score: row.overall_score,
    recommendation: toRecommendation(row.recommendation),
    matched: row.strengths ?? [],
    missing: row.gaps ?? [],
  }
}

/**
 * @param userId  Resolved auth user id (null when signed out / demo).
 * @param jobId   The open job's id (null when no sheet is open).
 */
export function useJobFitScore(userId: string | null, jobId: string | null): UseJobFitScoreResult {
  const enabled = Boolean(userId && jobId)
  const [data, setData] = useState<JobFitScoreData>(UNSCORED)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  // Adjust-state-during-render (component-patterns.md): when the open job
  // changes while the hook stays mounted, reset to a clean loading state in the
  // same render so the previous job's score never flashes. Guarded by prevJobId
  // so it cannot loop. This is the linter-accepted alternative to setState in an
  // effect body (react-hooks/set-state-in-effect).
  const [prevJobId, setPrevJobId] = useState(jobId)
  if (jobId !== prevJobId) {
    setPrevJobId(jobId)
    setData(UNSCORED)
    setError(null)
    setLoading(enabled)
  }

  useEffect(() => {
    // Nothing to fetch — keep the unscored default; no synchronous setState here.
    if (!userId || !jobId) return

    let cancelled = false
    const supabase = getSupabaseClientSafe()

    // Without a configured client we cannot score; degrade to unscored.
    if (!supabase) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setData(UNSCORED)
        setError(null)
        setLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve(
      supabase
        .from('ai_scores')
        .select('overall_score, strengths, gaps, recommendation, reasoning_trace')
        .eq('user_id', userId)
        .eq('job_id', jobId)
        .order('scored_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
      .then(({ data: row, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setData({ ...UNSCORED, state: 'error' })
        } else if (!row) {
          setError(null)
          setData(UNSCORED)
        } else {
          setError(null)
          setData(mapRow(row as AiScoreRow))
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load match score')
        setData({ ...UNSCORED, state: 'error' })
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, jobId])

  return { data, loading, error }
}
