/**
 * Shared contracts for the ATS crawl layer (_shared/crawl).
 *
 * Pure types only — no I/O, no Deno.* — so every consumer (adapters, normalize,
 * listEndpoint) stays unit-testable under vitest without a runtime, exactly like
 * the _shared/prep layer (ADR-013/015).
 */

/** ATS families the HTTP-only v1 crawler ingests. Workday is deferred (ADR-015). */
export type CrawlFamily = 'greenhouse' | 'lever' | 'ashby'

export const CRAWL_FAMILIES: readonly CrawlFamily[] = ['greenhouse', 'lever', 'ashby']

export type RemoteType = 'remote' | 'hybrid' | 'onsite'
export type SalaryInterval = 'year' | 'month' | 'week' | 'day' | 'hour'

/** The board fields the adapters need to build endpoints + label postings. */
export interface BoardRef {
  id: string
  ats_family: string
  board_token: string
  display_name?: string | null
  last_etag?: string | null
}

/**
 * A normalized posting — the exact shape the `upsert_job_postings(p_rows jsonb)`
 * RPC consumes (keys map 1:1 to job_postings columns; the RPC computes
 * content_hash and overrides board_id/ats_family from the trusted board).
 */
export interface UnifiedPosting {
  ats_family: CrawlFamily
  external_job_id: string
  company_name: string | null
  title: string
  location_raw: string | null
  remote_type: RemoteType | null
  department: string | null
  team: string | null
  employment_type: string | null
  description_html: string | null
  description_text: string | null
  application_url: string
  external_url: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_interval: SalaryInterval | null
  posted_at: string | null
}

/** A board-level list request resolved by buildListEndpoint (pure). */
export interface ListRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

/** Pagination cursor; null/undefined means first page / no more pages. */
export interface Cursor {
  offset?: number
}
