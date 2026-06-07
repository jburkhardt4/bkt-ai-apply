/**
 * useProspectorReadyQueue
 *
 * Queries applications joined to jobs where:
 *   - applications.user_id = current user (BR-005)
 *   - applications.match_score >= 60 (BR-105, BR-020)
 *   - jobs.source = 'prospector' (BR-105)
 *
 * Returns a shaped list of ProspectorJobMatch objects for the ReadyQueue UI.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient() from src/lib/supabase.ts
 *   BR-005 — every query filters by user_id
 *   BR-008 — auth state via useAuth() only
 *   BR-020 — match_score >= 60 threshold
 *   BR-105 — source = 'prospector' filter
 *   BR-081 / BR-082 — types from generated db.types.ts only
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import type { ProspectorJobMatch } from '../components/ProspectorReadyQueue'

// Match score threshold — cite BR-105, BR-020; never hardcode literals elsewhere
const READY_QUEUE_MIN_SCORE = 60

export interface UseProspectorReadyQueueResult {
  jobs: ProspectorJobMatch[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useProspectorReadyQueue(): UseProspectorReadyQueueResult {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<ProspectorJobMatch[]>([])
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  useEffect(() => {
    // No user — nothing to fetch; state already initialized to empty/false.
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClient()

    // Join applications -> jobs to filter by both match_score and jobs.source.
    // The select uses a nested join: jobs!inner ensures only rows with a matching
    // jobs row are returned (inner join semantics).
    Promise.resolve(
      supabase
        .from('applications')
        .select(
          `
          id,
          match_score,
          jobs!inner (
            id,
            title,
            source,
            company_id,
            companies (
              name
            )
          )
          `,
        )
        .eq('user_id', user.id)
        .gte('match_score', READY_QUEUE_MIN_SCORE)
        .eq('jobs.source', 'prospector')
        .order('match_score', { ascending: false })
        .limit(50),
    )
      .then(({ data, error: fetchError }) => {
        if (cancelled) return

        if (fetchError) {
          setError(fetchError.message)
          setJobs([])
        } else {
          const shaped: ProspectorJobMatch[] = (data ?? []).map((row) => {
            // The Supabase JS client infers the join result shape — use unknown
            // to safely narrow without relying on the inferred array/object type.
            const jobRaw = row.jobs as unknown
            const job =
              jobRaw != null && !Array.isArray(jobRaw) && typeof jobRaw === 'object'
                ? (jobRaw as {
                    id: string
                    title: string
                    source: string | null
                    company_id: string | null
                    companies: { name: string } | { name: string }[] | null
                  })
                : null

            // companies may be returned as an array (one-to-many inference) or object
            const companiesRaw = job?.companies
            const companyName = Array.isArray(companiesRaw)
              ? (companiesRaw[0]?.name ?? 'Unknown Company')
              : (companiesRaw?.name ?? 'Unknown Company')

            return {
              id: job?.id ?? row.id,
              title: job?.title ?? 'Unknown Title',
              company_name: companyName,
              match_score: row.match_score ?? 0,
              application_id: row.id,
            }
          })

          setJobs(shaped)
        }

        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load ready queue')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, refetchTrigger])

  const refetch = useCallback(() => {
    setRefetchTrigger((n) => n + 1)
  }, [])

  return {
    jobs,
    loading,
    error,
    refetch,
  }
}
