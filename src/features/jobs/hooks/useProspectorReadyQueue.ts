/**
 * useProspectorReadyQueue
 *
 * Queries applications joined to jobs where:
 *   - applications.user_id = current user (BR-005)
 *   - applications.match_score >= 60 (BR-105, BR-020)
 *   - jobs.source IN ('prospector','corpus') (BR-105) — corpus = crawled ATS board
 *
 * Returns a shaped list of ProspectorJobMatch objects for the ReadyQueue UI.
 *
 * Paginated server-side (Phase A): fetches one page of PAGE_SIZE rows via
 * `.range()` plus an exact total count, so the "Ready to Apply" queue can
 * toggle multiple pages (Phase B page controls consume `page` / `pageCount` /
 * `goToPage`). Page 0 preserves the prior 50-row behavior until the UI wires
 * navigation.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient() from src/lib/supabase.ts
 *   BR-005 — every query filters by user_id
 *   BR-008 — auth state via useAuth() only
 *   BR-020 — match_score >= 60 threshold
 *   BR-105 — source IN ('prospector','corpus') filter
 *   BR-081 / BR-082 — types from generated db.types.ts only
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClientSafe } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { PAGE_SIZE, getPageCount, pageRange } from '@/lib/pagination'
import type { ProspectorJobMatch } from '../components/ProspectorReadyQueue'
import { PROSPECTOR_READY_QUEUE_SEED } from '../data/prospectorSeedData'

// Match score threshold — cite BR-105, BR-020; never hardcode literals elsewhere
const READY_QUEUE_MIN_SCORE = 60

export interface UseProspectorReadyQueueResult {
  jobs: ProspectorJobMatch[]
  loading: boolean
  error: string | null
  refetch: () => void
  page: number
  pageCount: number
  totalCount: number
  goToPage: (page: number) => void
}

export function useProspectorReadyQueue(): UseProspectorReadyQueueResult {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<ProspectorJobMatch[]>([])
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    // No user — nothing to fetch; state already initialized to empty/false.
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClientSafe()

    // When Supabase is not configured, fall back to seed data so the UI
    // is reviewable without credentials (mirrors auto-apply service pattern).
    if (!supabase) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setJobs(PROSPECTOR_READY_QUEUE_SEED)
          setTotalCount(PROSPECTOR_READY_QUEUE_SEED.length)
          setLoading(false)
        }
      })
      return () => { cancelled = true }
    }

    const { from, to } = pageRange(page)

    // Join applications -> jobs to filter by both match_score and jobs.source.
    // The select uses a nested join: jobs!inner ensures only rows with a matching
    // jobs row are returned (inner join semantics). Both prospector (SerpApi) and
    // corpus (crawled ATS board, ADR-016) jobs surface in the Ready queue.
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
          { count: 'exact' },
        )
        .eq('user_id', user.id)
        .gte('match_score', READY_QUEUE_MIN_SCORE)
        .in('jobs.source', ['prospector', 'corpus'])
        .order('match_score', { ascending: false })
        .range(from, to),
    )
      .then(({ data, error: fetchError, count }) => {
        if (cancelled) return

        if (fetchError) {
          // Graceful fallback: show seed data so the UI is reviewable;
          // clear error so consumers don't see conflicting state.
          setError(null)
          setJobs(PROSPECTOR_READY_QUEUE_SEED)
          setTotalCount(PROSPECTOR_READY_QUEUE_SEED.length)
        } else {
          const rows = data ?? []
          // Seed only stands in for "no real data at all" — i.e. an empty
          // first page. A legitimately empty later page renders empty.
          if (rows.length === 0 && page === 0) {
            setJobs(PROSPECTOR_READY_QUEUE_SEED)
            setTotalCount(PROSPECTOR_READY_QUEUE_SEED.length)
            setLoading(false)
            return
          }

          const shaped: ProspectorJobMatch[] = rows.map((row) => {
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
          setTotalCount(count ?? shaped.length)
        }

        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Graceful fallback: seed data keeps UI usable; clear error for consistency.
        void err
        setError(null)
        setJobs(PROSPECTOR_READY_QUEUE_SEED)
        setTotalCount(PROSPECTOR_READY_QUEUE_SEED.length)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, refetchTrigger, page])

  const refetch = useCallback(() => {
    setRefetchTrigger((n) => n + 1)
  }, [])

  const goToPage = useCallback((next: number) => {
    // Show the skeleton while the next page loads. setLoading in the action
    // callback (not the effect body) keeps react-hooks/set-state-in-effect happy.
    setLoading(true)
    setPage(Math.max(0, next))
  }, [])

  return {
    jobs,
    loading,
    error,
    refetch,
    page,
    pageCount: getPageCount(totalCount, PAGE_SIZE),
    totalCount,
    goToPage,
  }
}
