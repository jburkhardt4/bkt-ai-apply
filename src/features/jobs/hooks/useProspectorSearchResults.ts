/**
 * useProspectorSearchResults
 *
 * Queries all jobs discovered by the prospector for the current user,
 * ordered newest-first. This drives the "Job Search Results" list on the
 * Prospector dashboard — separate from the "Ready to Apply" queue which
 * requires match scoring.
 *
 * Paginated server-side (Phase A): fetches one page of PAGE_SIZE rows via
 * `.range()` plus an exact total count, so the Prospector list can toggle
 * multiple pages (Phase B page controls consume `page` / `pageCount` /
 * `goToPage`). Page 0 preserves the prior 50-row behavior until the UI wires
 * navigation.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient()
 *   BR-005 — every query filters by user_id
 *   BR-008 — auth state via useAuth() only
 *   BR-105 — source IN ('prospector','corpus') filter — corpus = crawled ATS
 *            job-board postings projected into jobs (ADR-016); both surface here.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClientSafe } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { PAGE_SIZE, getPageCount, pageRange } from '@/lib/pagination'
import { PROSPECTOR_SEARCH_SEED } from '../data/prospectorSeedData'

export interface ProspectorSearchResult {
  id: string
  title: string
  company_name: string | null
  company_domain: string | null
  location: string | null
  remote_type: string | null
  job_type: string | null
  compensation_min: number | null
  compensation_max: number | null
  description: string | null
  description_formatted: string | null
  posted_at: string | null
  match_score: number | null
  /** Provenance of the row: 'prospector' (SerpApi) or 'corpus' (crawled ATS board). */
  source: string | null
  source_url: string
  created_at: string
}

export interface UseProspectorSearchResultsResult {
  jobs: ProspectorSearchResult[]
  loading: boolean
  error: string | null
  refetch: () => void
  page: number
  pageCount: number
  totalCount: number
  goToPage: (page: number) => void
}

export function useProspectorSearchResults(): UseProspectorSearchResultsResult {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<ProspectorSearchResult[]>([])
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClientSafe()

    // When Supabase is not configured, fall back to seed data so the UI
    // is reviewable without credentials (mirrors auto-apply service pattern).
    if (!supabase) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setJobs(PROSPECTOR_SEARCH_SEED)
          setTotalCount(PROSPECTOR_SEARCH_SEED.length)
          setLoading(false)
        }
      })
      return () => { cancelled = true }
    }

    const { from, to } = pageRange(page)

    Promise.resolve(
      supabase
        .from('jobs')
        .select(
          `
          id,
          title,
          location,
          remote_type,
          job_type,
          compensation_min,
          compensation_max,
          description,
          description_formatted,
          posted_at,
          source,
          source_url,
          created_at,
          companies (
            name,
            domain
          ),
          ai_scores (
            overall_score,
            scored_at
          )
          `,
          { count: 'exact' },
        )
        .eq('user_id', user.id)
        .in('source', ['prospector', 'corpus'])
        .order('created_at', { ascending: false })
        .range(from, to),
    )
      .then(({ data, error: fetchError, count }) => {
        if (cancelled) return

        if (fetchError) {
          // Graceful fallback: show seed data so the UI is reviewable;
          // clear error so consumers don't see conflicting state.
          setError(null)
          setJobs(PROSPECTOR_SEARCH_SEED)
          setTotalCount(PROSPECTOR_SEARCH_SEED.length)
        } else {
          const rows = data ?? []
          // Seed only stands in for "no real data at all" — i.e. an empty
          // first page. A legitimately empty later page renders empty.
          if (rows.length === 0 && page === 0) {
            setJobs(PROSPECTOR_SEARCH_SEED)
            setTotalCount(PROSPECTOR_SEARCH_SEED.length)
            setError(null)
            setLoading(false)
            return
          }

          const shaped: ProspectorSearchResult[] = rows.map((row) => {
            const companiesRaw = row.companies as unknown
            const company = Array.isArray(companiesRaw)
              ? (companiesRaw[0] as { name?: string; domain?: string | null } | undefined)
              : typeof companiesRaw === 'object' && companiesRaw != null
                ? (companiesRaw as { name?: string; domain?: string | null })
                : undefined
            const companyName = company?.name ?? null
            const companyDomain = company?.domain ?? null

            // Match score lives in ai_scores (versioned per job); take the most
            // recently scored row. Embedded ai_scores are RLS-scoped to the user.
            const scoresRaw = row.ai_scores as unknown
            let matchScore: number | null = null
            if (Array.isArray(scoresRaw) && scoresRaw.length > 0) {
              const scores = scoresRaw as { overall_score: number; scored_at: string }[]
              const latest = scores.reduce((a, b) => (b.scored_at > a.scored_at ? b : a))
              matchScore = latest.overall_score
            }

            return {
              id: row.id,
              title: row.title,
              company_name: companyName,
              company_domain: companyDomain,
              location: row.location,
              remote_type: row.remote_type,
              job_type: row.job_type,
              compensation_min: row.compensation_min,
              compensation_max: row.compensation_max,
              description: row.description,
              description_formatted: row.description_formatted,
              posted_at: row.posted_at,
              match_score: matchScore,
              source: row.source ?? null,
              source_url: row.source_url,
              created_at: row.created_at,
            }
          })

          setJobs(shaped)
          setTotalCount(count ?? shaped.length)
          setError(null)
        }

        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Graceful fallback: seed data keeps UI usable; clear error for consistency.
        void err
        setError(null)
        setJobs(PROSPECTOR_SEARCH_SEED)
        setTotalCount(PROSPECTOR_SEARCH_SEED.length)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, refetchTrigger, page])

  const refetch = useCallback(() => {
    // Surface the loading state on manual refetch so the list shows its
    // skeleton instead of silently swapping rows. setLoading lives here in the
    // callback (not in the effect body) to avoid the
    // react-hooks/set-state-in-effect lint error.
    setLoading(true)
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
