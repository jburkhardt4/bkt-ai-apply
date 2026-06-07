/**
 * useProspectorSearchResults
 *
 * Queries all jobs discovered by the prospector for the current user,
 * ordered newest-first. This drives the "Job Search Results" list on the
 * Prospector dashboard — separate from the "Ready to Apply" queue which
 * requires match scoring.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient()
 *   BR-005 — every query filters by user_id
 *   BR-008 — auth state via useAuth() only
 *   BR-105 — source = 'prospector' filter
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'

export interface ProspectorSearchResult {
  id: string
  title: string
  company_name: string | null
  location: string | null
  remote_type: string | null
  compensation_min: number | null
  compensation_max: number | null
  source_url: string
  created_at: string
}

export interface UseProspectorSearchResultsResult {
  jobs: ProspectorSearchResult[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useProspectorSearchResults(): UseProspectorSearchResultsResult {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<ProspectorSearchResult[]>([])
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClient()

    Promise.resolve(
      supabase
        .from('jobs')
        .select(
          `
          id,
          title,
          location,
          remote_type,
          compensation_min,
          compensation_max,
          source_url,
          created_at,
          companies (
            name
          )
          `,
        )
        .eq('user_id', user.id)
        .eq('source', 'prospector')
        .order('created_at', { ascending: false })
        .limit(50),
    )
      .then(({ data, error: fetchError }) => {
        if (cancelled) return

        if (fetchError) {
          setError(fetchError.message)
          setJobs([])
        } else {
          const shaped: ProspectorSearchResult[] = (data ?? []).map((row) => {
            const companiesRaw = row.companies as unknown
            const companyName = Array.isArray(companiesRaw)
              ? ((companiesRaw[0] as { name?: string } | undefined)?.name ?? null)
              : typeof companiesRaw === 'object' && companiesRaw != null
                ? ((companiesRaw as { name?: string }).name ?? null)
                : null

            return {
              id: row.id,
              title: row.title,
              company_name: companyName,
              location: row.location,
              remote_type: row.remote_type,
              compensation_min: row.compensation_min,
              compensation_max: row.compensation_max,
              source_url: row.source_url,
              created_at: row.created_at,
            }
          })

          setJobs(shaped)
          setError(null)
        }

        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load search results')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, refetchTrigger])

  const refetch = useCallback(() => {
    setRefetchTrigger((n) => n + 1)
  }, [])

  return { jobs, loading, error, refetch }
}
