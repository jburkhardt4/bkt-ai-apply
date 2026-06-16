/**
 * useProspectingRuns
 *
 * Fetches the 10 most recent prospecting_runs for the current user.
 * Derives last_run_at from the most recent run row.
 * next_run_at lives on the profile row — callers pass profile.next_run_at directly.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient() from src/lib/supabase.ts
 *   BR-005 — every query filters by user_id (enforced both by RLS and explicit filter)
 *   BR-008 — auth state via useAuth() only
 *   BR-081 / BR-082 — types from generated db.types.ts only
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClientSafe } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import type { Tables } from '@/types/db.types'

// Columns actually read downstream (last-run derivation + run-history display).
// Derived from the generated Tables<'prospecting_runs'> type — never handwritten
// (BR-081 / BR-082) — and kept in sync with the explicit .select() below so we
// do not over-fetch profile_id / user_id, which no consumer reads.
const RUN_COLUMNS = 'id, run_at, status, jobs_found, jobs_queued, error' as const

export type ProspectingRunRow = Pick<
  Tables<'prospecting_runs'>,
  'id' | 'run_at' | 'status' | 'jobs_found' | 'jobs_queued' | 'error'
>

export interface UseProspectingRunsResult {
  runs: ProspectingRunRow[]
  lastRunAt: string | null
  nextRunAt: string | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useProspectingRuns(): UseProspectingRunsResult {
  const { user } = useAuth()
  const [runs, setRuns] = useState<ProspectingRunRow[]>([])
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  useEffect(() => {
    // No user — nothing to fetch; state already initialized to empty/false.
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClientSafe()

    // When Supabase is not configured, gracefully degrade — no run history.
    if (!supabase) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(false)
      })
      return () => { cancelled = true }
    }

    Promise.resolve(
      supabase
        .from('prospecting_runs')
        .select(RUN_COLUMNS)
        .eq('user_id', user.id)
        .order('run_at', { ascending: false })
        .limit(10),
    )
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setRuns([])
        } else {
          setRuns(data ?? [])
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load run history')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, refetchTrigger])

  const refetch = useCallback(() => {
    // Surface loading on manual refetch (e.g. after a Run Now) so the Run
    // Status reflects the in-flight fetch. setLoading lives in the callback,
    // not the effect body, to avoid the react-hooks/set-state-in-effect error.
    setLoading(true)
    setRefetchTrigger((n) => n + 1)
  }, [])

  // Derive last_run_at from the most recent run row
  const lastRunAt = runs.length > 0 ? runs[0].run_at : null

  // next_run_at is not stored on runs — it lives on the profile row.
  // Expose null here; ProspectorDashboard passes profile.next_run_at directly.
  const nextRunAt: string | null = null

  return {
    runs,
    lastRunAt,
    nextRunAt,
    loading,
    error,
    refetch,
  }
}
