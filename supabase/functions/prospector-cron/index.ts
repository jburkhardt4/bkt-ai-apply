/**
 * prospector-cron — Edge Function
 *
 * Triggered on schedule: 0 8,18 * * * UTC (twice daily, satisfying BR-100).
 * Reads all active prospecting_profiles, queries SerpApi Google Jobs for each,
 * upserts discovered jobs into the jobs table, and writes a prospecting_runs audit row.
 *
 * Non-negotiables enforced here:
 * - BR-001: RLS always on (not disabled; service role bypasses RLS by design for server ops)
 * - BR-004: Single DB client pattern mirrored from src/lib/supabase.ts
 * - BR-005: Every query scoped to the owning user_id
 * - BR-006: SUPABASE_SERVICE_ROLE_KEY never leaves the Edge Function runtime
 * - BR-063 / BR-102: Deduplication by source_url (ON CONFLICT DO NOTHING)
 * - BR-100: Cron schedule enforces twice-daily maximum; function trusts the scheduler
 * - BR-105: All prospector-inserted jobs carry source = 'prospector'
 * - BR-106: Zero-result runs write prospecting_runs with status = 'empty'
 * - BR-107: is_active = false profiles are skipped at query time
 * - INT-RULE-003: Exponential backoff on SerpApi 429 responses
 * - INT-RULE-006: SERPAPI_KEY accessed only via Deno.env; never in client bundle
 */

// @ts-expect-error — esm.sh URL import; resolved by Deno runtime, not Node TS server
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getApiKeyForProvider } from '../_shared/llm/factory.ts'
import { formatJdMarkdown } from '../_shared/jd-format.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of prospecting_profiles row we need for query construction. */
interface ProspectingProfile {
  id: string
  user_id: string
  job_titles: string[]
  locations: string[]
  environments: string[]
  keywords: string[]
  job_types: string[]
  min_salary: number | null
}

/** SerpApi Google Jobs response — jobs_results element. */
interface SerpApiJobResult {
  title?: string
  company_name?: string
  location?: string
  description?: string
  job_highlights?: Array<{ title?: string; items?: string[] }>
  detected_extensions?: {
    posted_at?: string
    schedule_type?: string
    work_from_home?: boolean
    // SerpApi returns salary as a single formatted string, e.g. "73K–97K a year"
    salary?: string
  }
  apply_options?: Array<{ title?: string; link?: string }>
  related_links?: Array<{ link?: string; text?: string }>
  link?: string
  job_id?: string
}

/** Parsed min/max integers from a SerpApi salary string. */
interface ParsedSalary {
  min: number | null
  max: number | null
}

/**
 * Parses a SerpApi salary string into integer min/max values for int4 Postgres columns.
 *
 * Handles:
 *   "73K–97K a year"     → { min: 73000,  max: 97000  }
 *   "77K–138K a year"    → { min: 77000,  max: 138000 }
 *   "$100,000 a year"    → { min: 100000, max: 100000 }
 *   "1.5M–2M a year"     → { min: 1500000, max: 2000000 }
 *   "unparseable string" → { min: null,   max: null   }
 *
 * Unicode dashes handled: en dash (–, U+2013), em dash (—, U+2014), hyphen-minus (-).
 * "K" suffix multiplied by 1,000. "M" suffix multiplied by 1,000,000.
 */
function parseSalary(salaryStr: string | undefined): ParsedSalary {
  if (!salaryStr) return { min: null, max: null }

  // Strip currency symbols and thousands-separator commas
  const cleaned = salaryStr.replace(/[$,]/g, '')

  const parseValue = (raw: string): number | null => {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([KkMm]?)/)
    if (!match) return null
    const num = parseFloat(match[1])
    const suffix = match[2].toUpperCase()
    if (suffix === 'K') return Math.round(num * 1_000)
    if (suffix === 'M') return Math.round(num * 1_000_000)
    return Math.round(num)
  }

  // Range: "73K–97K" / "73K-97K" — any unicode dash variant
  const rangeMatch = cleaned.match(
    /^(\d+(?:\.\d+)?[KkMm]?)\s*[–—-]\s*(\d+(?:\.\d+)?[KkMm]?)/
  )
  if (rangeMatch) {
    return { min: parseValue(rangeMatch[1]), max: parseValue(rangeMatch[2]) }
  }

  // Single value: "100K a year" → min === max
  const singleMatch = cleaned.match(/^(\d+(?:\.\d+)?[KkMm]?)/)
  if (singleMatch) {
    const val = parseValue(singleMatch[1])
    return { min: val, max: val }
  }

  return { min: null, max: null }
}

/** Mapped job row ready to upsert into the jobs table. */
interface JobInsert {
  user_id: string
  title: string
  location: string | null
  remote_type: string | null
  description: string | null
  skills: string[]
  source: string
  source_url: string
  company_id: string | null
  compensation_min: number | null
  compensation_max: number | null
  posted_at: string | null
  job_type: string | null
  application_method: string | null
}

/** Summary stats accumulated per profile run. */
interface RunStats {
  // Raw count of results returned by SerpApi across all title queries. Never
  // decremented — this is the true "fetched" figure for audit/observability.
  // Kept separate from jobs_found so the existing jobs_found/jobs_queued column
  // semantics (and the response shape) stay unchanged; jobs_found continues to
  // mean "ingestable results" (raw minus non-ingestable), jobs_queued means
  // "newly inserted after dedupe".
  jobs_fetched_raw: number
  jobs_found: number
  jobs_queued: number
  status: 'success' | 'empty' | 'partial' | 'error'
  errors: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json'
const SERPAPI_RESULTS_PER_PAGE = 10
const SOURCE_LABEL = 'prospector'

// JD normalization at creation time (jd_formatting → Claude 3.5 Haiku). Bounded
// per run so a large discovery batch can't blow the function timeout or run up
// cost; any job not formatted here is backfilled lazily when first viewed.
const JD_FORMAT_MODEL_NAME = 'Claude 3.5 Haiku'
const JD_FORMAT_MAX_PER_RUN = 25
// Anthropic list price for Haiku 3.5 (USD per token) — mirrors getModelPricing in
// src/lib/ai-router.ts. Used only for ai_model_usage cost logging (AI-RULE-002).
const JD_HAIKU_INPUT_USD_PER_TOKEN = 0.8 / 1_000_000
const JD_HAIKU_OUTPUT_USD_PER_TOKEN = 4 / 1_000_000

// Exponential backoff config (INT-RULE-003)
const BACKOFF_MAX_RETRIES = 3
const BACKOFF_BASE_MS = 1_000

// ---------------------------------------------------------------------------
// Supabase service-role client (mirrors pattern from src/lib/supabase.ts)
// Service role is used here because Edge Functions run server-side and need to
// read all active profiles across users and write run audit rows on their behalf.
// SUPABASE_SERVICE_ROLE_KEY never reaches the client bundle (BR-006).
// ---------------------------------------------------------------------------

function createServiceClient(): SupabaseClient {
  // @ts-expect-error — Deno global provided by Edge Function runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // @ts-expect-error — Deno global provided by Edge Function runtime
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'prospector-cron: Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Service role client must not persist auth sessions
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

// ---------------------------------------------------------------------------
// SerpApi helpers
// ---------------------------------------------------------------------------

/**
 * Builds the SerpApi query string for a single job title + profile combination.
 *
 * Mapping (from docs/architecture.md §6.1):
 *   job_titles[i]   → q (one call per title)
 *   environments[]  → 'remote' or 'hybrid' appended to q
 *   keywords[]      → NOT in q (too specific; kills results for niche roles)
 *   locations[0]    → location parameter (full name, e.g. "California, United States")
 *   job_types[]     → chips parameter (job_type:fulltime etc.) — omitted when empty
 */
function buildSerpApiUrl(
  jobTitle: string,
  profile: ProspectingProfile,
  serpApiKey: string
): string {
  const params = new URLSearchParams()

  params.set('engine', 'google_jobs')
  params.set('api_key', serpApiKey)
  params.set('google_domain', 'google.com')
  params.set('num', String(SERPAPI_RESULTS_PER_PAGE))
  params.set('hl', 'en')
  params.set('gl', 'us')

  // q = "{jobTitle}" or "{jobTitle} remote" or "{jobTitle} hybrid"
  // Use only the first work-mode modifier — appending multiple breaks the query.
  // No hardcoded suffixes: "job opening" was confirmed to produce zero results (6a25ca6e).
  const envModifier = profile.environments.find((e) => e === 'remote' || e === 'hybrid')
  const q = envModifier ? `${jobTitle} ${envModifier}` : jobTitle
  params.set('q', q)

  // location: use first non-empty element
  const primaryLocation = profile.locations.find((l) => l.trim().length > 0)
  if (primaryLocation) {
    params.set('location', primaryLocation)
  }

  // chips: employment-type filters only. date_posted:week removed — it was zeroing out
  // results for niche role/location combos. Source-url deduplication handles re-ingestion.
  //
  // CRITICAL: SerpApi's Google Jobs engine expects the chip token `employment_type:FULLTIME`
  // (uppercase enum), NOT `job_type:fulltime`. The wrong token makes Google return a soft
  // "no results" (HTTP 200 + error field, zero jobs_results) — silently zeroing every run.
  // Verified tokens: FULLTIME, PARTTIME, CONTRACTOR, INTERN.
  const chipsparts: string[] = []

  const jobTypeMap: Record<string, string> = {
    'full-time': 'employment_type:FULLTIME',
    'part-time': 'employment_type:PARTTIME',
    contract: 'employment_type:CONTRACTOR',
    internship: 'employment_type:INTERN',
    intern: 'employment_type:INTERN',
  }
  for (const jt of profile.job_types) {
    const mapped = jobTypeMap[jt.toLowerCase()]
    if (mapped) chipsparts.push(mapped)
  }

  if (chipsparts.length > 0) {
    params.set('chips', chipsparts.join(','))
  }

  return `${SERPAPI_BASE}?${params.toString()}`
}

/**
 * Fetches SerpApi with exponential backoff on 429 (INT-RULE-003).
 * A non-retryable error (e.g. 401, 400) is thrown immediately.
 *
 * NOTE: SerpApi returns HTTP 200 with an `error` field for "soft" failures
 * (e.g. "Google hasn't returned any results for this query"). We log these so
 * a genuine zero-result run is distinguishable from a malformed query in the
 * edge logs — the wrong `chips` token previously hid here as a silent empty.
 */
async function fetchSerpApi(url: string): Promise<SerpApiJobResult[]> {
  let attempt = 0

  while (attempt <= BACKOFF_MAX_RETRIES) {
    const response = await fetch(url)

    if (response.ok) {
      const data = await response.json() as {
        jobs_results?: SerpApiJobResult[]
        error?: string
      }
      if (data.error) {
        console.warn(`prospector-cron: SerpApi soft error (HTTP 200): ${data.error}`)
      }
      return data.jobs_results ?? []
    }

    if (response.status === 429) {
      if (attempt === BACKOFF_MAX_RETRIES) {
        throw new Error(`SerpApi rate limit hit after ${BACKOFF_MAX_RETRIES} retries`)
      }
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt)
      console.warn(`prospector-cron: SerpApi 429 — retrying in ${delayMs}ms (attempt ${attempt + 1})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      attempt++
      continue
    }

    // Non-retryable error
    const body = await response.text()
    throw new Error(`SerpApi error ${response.status}: ${body.slice(0, 200)}`)
  }

  // Unreachable, but TypeScript requires a return
  return []
}

// ---------------------------------------------------------------------------
// Company upsert helper
// ---------------------------------------------------------------------------

/**
 * Best-effort company web domain from a posting's apply URL. Returns the bare
 * host (no www.) ONLY when it is the employer's own site — known job boards and
 * ATS hosts are rejected (their favicon is the board's, not the company's), so
 * the JD sidebar falls back to the source-board favicon instead. Returns null
 * when the URL is unparseable or board-owned.
 */
function deriveCompanyDomain(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null
  let host: string
  try {
    host = new URL(sourceUrl).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
  if (!host) return null
  const BOARD_HOSTS = [
    'google.com', 'dice.com', 'bebee.com', 'indeed.com', 'linkedin.com',
    'glassdoor.com', 'ziprecruiter.com', 'monster.com', 'simplyhired.com',
    'careersprint.com', 'wellfound.com', 'angel.co', 'jobvite.com',
    'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
    'ashbyhq.com', 'icims.com', 'smartrecruiters.com', 'workable.com',
    'taleo.net', 'jobs.net', 'recruiting.com',
  ]
  const isBoard = BOARD_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))
  return isBoard ? null : host
}

/**
 * Looks up or inserts a company by name, capturing a best-effort web domain.
 * Returns the company UUID, or null if company_name is empty. The companies
 * table is a shared lookup (not user-scoped); see E-003. When an existing
 * company has no domain yet and we derived one, we backfill it so the JD
 * sidebar can resolve a real logo on subsequent views.
 */
async function upsertCompany(
  supabase: SupabaseClient,
  companyName: string | undefined,
  domain: string | null
): Promise<string | null> {
  if (!companyName?.trim()) return null

  const name = companyName.trim()

  // Try to find an existing company first (shared lookup table)
  const { data: existing, error: selectError } = await supabase
    .from('companies')
    .select('id, domain')
    .eq('name', name)
    .maybeSingle()

  if (selectError) {
    console.warn(`prospector-cron: company lookup failed for "${name}": ${selectError.message}`)
    return null
  }

  if (existing) {
    // Backfill a missing domain when we now have one (best-effort; ignore errors).
    if (domain && !existing.domain) {
      const { error: domainError } = await supabase
        .from('companies')
        .update({ domain })
        .eq('id', existing.id)
      if (domainError) {
        console.warn(`prospector-cron: company domain backfill failed for "${name}": ${domainError.message}`)
      }
    }
    return existing.id
  }

  // Insert a new company record
  const { data: inserted, error: insertError } = await supabase
    .from('companies')
    .insert(domain ? { name, domain } : { name })
    .select('id')
    .single()

  if (insertError) {
    // Race condition: another insert may have beaten us; try lookup again
    if (insertError.code === '23505') {
      const { data: retry } = await supabase
        .from('companies')
        .select('id')
        .eq('name', name)
        .maybeSingle()
      return retry?.id ?? null
    }
    console.warn(`prospector-cron: company insert failed for "${name}": ${insertError.message}`)
    return null
  }

  return inserted?.id ?? null
}

/**
 * Formats newly-discovered job descriptions into clean Markdown and stores them
 * on jobs.description_formatted, logging one ai_model_usage row per call. This
 * is the creation-time normalization path (jd_formatting → Claude 3.5 Haiku).
 *
 * Best-effort and bounded: at most JD_FORMAT_MAX_PER_RUN jobs are formatted per
 * run; any error (missing key, model failure, write failure) is logged and
 * skipped so discovery is never blocked. Unformatted jobs fall back to the raw
 * description and are backfilled lazily the first time they're viewed.
 */
async function formatAndStoreNewJobs(
  supabase: SupabaseClient,
  userId: string,
  newJobs: { id: string; description: string }[]
): Promise<void> {
  if (newJobs.length === 0) return

  const apiKey = getApiKeyForProvider('anthropic')
  if (!apiKey) {
    console.warn('prospector-cron: ANTHROPIC_KEY not configured — skipping JD formatting')
    return
  }

  const batch = newJobs.slice(0, JD_FORMAT_MAX_PER_RUN)
  for (const job of batch) {
    try {
      const { markdown, usage } = await formatJdMarkdown({
        provider: 'anthropic',
        model: JD_FORMAT_MODEL_NAME,
        apiKey,
        description: job.description,
      })
      if (markdown.length === 0) continue

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ description_formatted: markdown })
        .eq('id', job.id)
      if (updateError) {
        console.warn(`prospector-cron: storing formatted JD failed for job ${job.id}: ${updateError.message}`)
        continue
      }

      const estimatedCostUsd = Number(
        (usage.input_tokens * JD_HAIKU_INPUT_USD_PER_TOKEN +
          usage.output_tokens * JD_HAIKU_OUTPUT_USD_PER_TOKEN).toFixed(6),
      )
      const { error: usageError } = await supabase.from('ai_model_usage').insert({
        user_id: userId,
        model_provider: 'anthropic',
        model_name: JD_FORMAT_MODEL_NAME,
        task_type: 'jd_formatting',
        tokens_in: usage.input_tokens,
        tokens_out: usage.output_tokens,
        estimated_cost_usd: estimatedCostUsd,
        application_id: null,
      })
      if (usageError) {
        console.warn(`prospector-cron: logging JD formatting usage failed for job ${job.id}: ${usageError.message}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`prospector-cron: JD formatting failed for job ${job.id}: ${msg}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Job mapping
// ---------------------------------------------------------------------------

/**
 * Extracts a stable source_url from a SerpApi job result.
 *
 * Priority (corrected per SerpApi docs — apply links live in apply_options, not result.link):
 *   1. apply_options[0].link — the canonical apply URL returned by Google Jobs
 *   2. result.link — present on some results as a fallback
 *   3. related_links[0].link
 *   4. Stable fallback from job_id — not a real apply URL but guarantees deduplication
 */
function extractSourceUrl(result: SerpApiJobResult): string | null {
  const applyLink = result.apply_options?.[0]?.link
  if (applyLink) return applyLink

  if (result.link) return result.link

  const firstRelated = result.related_links?.[0]?.link
  if (firstRelated) return firstRelated

  if (result.job_id) {
    return `https://www.google.com/search?q=apply+job+${result.job_id}`
  }

  return null
}

/**
 * Infers remote_type from SerpApi result fields.
 * Maps to jobs.remote_type enum: 'remote' | 'hybrid' | 'onsite'
 */
function inferRemoteType(result: SerpApiJobResult): string | null {
  // work_from_home is the canonical boolean Google Jobs returns for remote roles
  if (result.detected_extensions?.work_from_home === true) return 'remote'

  const scheduleType = result.detected_extensions?.schedule_type?.toLowerCase() ?? ''
  const location = result.location?.toLowerCase() ?? ''
  const title = result.title?.toLowerCase() ?? ''

  if (scheduleType.includes('remote') || location.includes('remote') || title.includes('remote')) {
    return 'remote'
  }

  if (scheduleType.includes('hybrid') || location.includes('hybrid') || title.includes('hybrid')) {
    return 'hybrid'
  }

  if (location.trim().length > 0) return 'onsite'

  return null
}

/**
 * Extracts skill-like terms from job_highlights (e.g., "Qualifications" section items).
 * Returns an array of short strings suitable for jobs.skills[].
 */
function extractSkills(result: SerpApiJobResult): string[] {
  const qualificationsHighlight = result.job_highlights?.find(
    (h) => h.title?.toLowerCase().includes('qualification') ||
           h.title?.toLowerCase().includes('requirement') ||
           h.title?.toLowerCase().includes('skill')
  )

  if (!qualificationsHighlight?.items) return []

  // Keep only short items (likely skill names, not full sentences)
  return qualificationsHighlight.items
    .filter((item) => item.length <= 60)
    .slice(0, 20)
}

/**
 * Parses SerpApi's posted_at string (e.g., "2 days ago", "1 week ago")
 * into an ISO 8601 timestamp. Returns null if parsing is not possible.
 *
 * We do not rely on a full NLP parser — only well-known patterns.
 */
function parsePostedAt(postedAt: string | undefined): string | null {
  if (!postedAt) return null

  const now = new Date()
  const lower = postedAt.toLowerCase().trim()

  const hoursMatch = lower.match(/^(\d+)\s+hour/)
  if (hoursMatch) {
    const d = new Date(now.getTime() - parseInt(hoursMatch[1]) * 3_600_000)
    return d.toISOString()
  }

  const daysMatch = lower.match(/^(\d+)\s+day/)
  if (daysMatch) {
    const d = new Date(now.getTime() - parseInt(daysMatch[1]) * 86_400_000)
    return d.toISOString()
  }

  const weeksMatch = lower.match(/^(\d+)\s+week/)
  if (weeksMatch) {
    const d = new Date(now.getTime() - parseInt(weeksMatch[1]) * 7 * 86_400_000)
    return d.toISOString()
  }

  return null
}

/**
 * Maps a SerpApi job result to a JobInsert row.
 * Returns null if the result is not ingestable or is filtered out by salary requirements.
 *
 * Salary filter rule (bulletproof null handling):
 *   - If minSalary is set AND the job explicitly lists a salary AND the highest
 *     listed value is strictly less than minSalary → discard.
 *   - If the job has NO salary data (null/undefined) → RETAIN regardless of minSalary.
 *     Absence of salary data ≠ paying below threshold.
 */
async function mapJobResult(
  result: SerpApiJobResult,
  userId: string,
  supabase: SupabaseClient,
  minSalary: number | null
): Promise<JobInsert | null> {
  const title = result.title?.trim()
  if (!title) return null

  const sourceUrl = extractSourceUrl(result)
  if (!sourceUrl) return null

  // Parse salary string → integers before filter and DB insert.
  // Postgres compensation_min / compensation_max are int4 — never insert the raw string.
  const { min: compensationMin, max: compensationMax } = parseSalary(
    result.detected_extensions?.salary
  )

  // Salary filter — only applied when profile has a minimum and the job lists a salary.
  // Jobs with NO salary data (null) are always retained.
  if (minSalary != null) {
    const hasSalaryData = compensationMin != null || compensationMax != null

    if (hasSalaryData) {
      // Use highest listed figure. Explicit null checks ensure a missing side
      // contributes -Infinity and never accidentally passes the threshold.
      const highestListed = Math.max(
        compensationMax != null ? compensationMax : -Infinity,
        compensationMin != null ? compensationMin : -Infinity,
      )
      if (highestListed < minSalary) {
        return null // Salary explicitly listed below minimum — discard
      }
    }
    // hasSalaryData === false → no salary listed → retain
  }

  const companyDomain = deriveCompanyDomain(sourceUrl)
  const companyId = await upsertCompany(supabase, result.company_name, companyDomain)

  return {
    user_id: userId,
    title,
    location: result.location?.trim() ?? null,
    remote_type: inferRemoteType(result),
    description: result.description?.trim() ?? null,
    skills: extractSkills(result),
    source: SOURCE_LABEL,
    source_url: sourceUrl,
    company_id: companyId,
    compensation_min: compensationMin,
    compensation_max: compensationMax,
    posted_at: parsePostedAt(result.detected_extensions?.posted_at),
    // schedule_type from SerpApi: "Full-time" | "Contractor" | "Part-time" | "Internship"
    job_type: result.detected_extensions?.schedule_type?.trim() ?? null,
    application_method: null,
  }
}

// ---------------------------------------------------------------------------
// Per-profile run
// ---------------------------------------------------------------------------

/**
 * Runs the full prospector pipeline for a single active profile.
 *
 * Strategy for profiles with multiple job_titles:
 *   Issue one SerpApi call per title. This maximises coverage when the user
 *   has configured multiple target roles. Total API calls = job_titles.length.
 *   If job_titles is empty, the run is skipped (no query possible).
 *
 * Error isolation: errors on a single title query are caught and accumulated.
 * A per-profile failure does not abort processing of other profiles.
 */
async function runForProfile(
  profile: ProspectingProfile,
  supabase: SupabaseClient,
  serpApiKey: string
): Promise<RunStats> {
  const stats: RunStats = {
    jobs_fetched_raw: 0,
    jobs_found: 0,
    jobs_queued: 0,
    status: 'success',
    errors: [],
  }

  // Jobs newly inserted this run, eligible for creation-time JD formatting.
  const newJobs: { id: string; description: string }[] = []

  if (profile.job_titles.length === 0) {
    console.warn(`prospector-cron: profile ${profile.id} has no job_titles — skipping`)
    stats.status = 'empty'
    return stats
  }

  for (const jobTitle of profile.job_titles) {
    let serpResults: SerpApiJobResult[]

    try {
      const url = buildSerpApiUrl(jobTitle, profile, serpApiKey)
      console.log(`prospector-cron: querying SerpApi for profile ${profile.id}, title="${jobTitle}"`)
      serpResults = await fetchSerpApi(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`prospector-cron: SerpApi failed for profile ${profile.id}, title="${jobTitle}": ${msg}`)
      stats.errors.push(`[${jobTitle}] SerpApi error: ${msg}`)
      stats.status = 'partial'
      continue
    }

    // Raw fetched count (never decremented) vs. ingestable count (jobs_found,
    // decremented below when a result lacks a title/source_url).
    stats.jobs_fetched_raw += serpResults.length
    stats.jobs_found += serpResults.length

    for (const result of serpResults) {
      let mappedJob: JobInsert | null
      let mappingFailed = false

      try {
        mappedJob = await mapJobResult(result, profile.user_id, supabase, profile.min_salary)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`prospector-cron: job mapping failed for profile ${profile.id}: ${msg}`)
        stats.errors.push(`[${jobTitle}] mapping error: ${msg}`)
        stats.status = 'partial'
        mappingFailed = true
        mappedJob = null
      }

      if (mappingFailed) continue

      if (!mappedJob) {
        // Result lacked title or source_url — not ingestable; not an error
        stats.jobs_found -= 1
        continue
      }

      const jobRow = mappedJob

      // Upsert with ON CONFLICT DO NOTHING — deduplication by source_url (BR-063, BR-102).
      // .select('id') returns the row ONLY when it was newly inserted (a duplicate
      // returns an empty set), so we know precisely which jobs need formatting and
      // jobs_queued counts true inserts (its documented "newly inserted" meaning).
      const { data: upsertedRows, error: upsertError } = await supabase
        .from('jobs')
        .upsert(jobRow, {
          onConflict: 'source_url',
          ignoreDuplicates: true,
        })
        .select('id')

      if (upsertError) {
        const msg = upsertError.message
        console.error(`prospector-cron: jobs upsert failed for profile ${profile.id}: ${msg}`)
        stats.errors.push(`[${jobTitle}] upsert error: ${msg}`)
        stats.status = 'partial'
        continue
      }

      const insertedId = upsertedRows?.[0]?.id
      if (insertedId) {
        stats.jobs_queued += 1
        if (jobRow.description && jobRow.description.trim().length > 0) {
          newJobs.push({ id: insertedId, description: jobRow.description })
        }
      }
    }
  }

  // Format newly-discovered JDs into clean Markdown at creation time (best-effort,
  // bounded). Failures never abort ingestion — unformatted jobs backfill lazily.
  await formatAndStoreNewJobs(supabase, profile.user_id, newJobs)

  // Resolve final status
  if (stats.jobs_found === 0 && stats.errors.length === 0) {
    // BR-106: zero results is not an error
    stats.status = 'empty'
  } else if (stats.errors.length > 0 && stats.jobs_queued === 0) {
    stats.status = 'error'
  } else if (stats.errors.length > 0) {
    stats.status = 'partial'
  } else {
    stats.status = 'success'
  }

  return stats
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

// @ts-expect-error — Deno global provided by Edge Function runtime
Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight — required for supabase.functions.invoke() from the browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

  console.log('prospector-cron: invoked')

  // @ts-expect-error — Deno global provided by Edge Function runtime
  const serpApiKey = Deno.env.get('SERPAPI_KEY')
  if (!serpApiKey) {
    console.error('prospector-cron: SERPAPI_KEY env var is not set')
    return new Response(
      JSON.stringify({ error: 'SERPAPI_KEY is not configured' }),
      { status: 500, headers: jsonHeaders }
    )
  }

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`prospector-cron: failed to create Supabase client: ${msg}`)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: jsonHeaders }
    )
  }

  // Fetch all active profiles (BR-107: is_active = false are excluded at query time)
  // Service role bypasses RLS intentionally — this is a server-side cron, not a user request.
  const { data: profiles, error: profilesError } = await supabase
    .from('prospecting_profiles')
    .select('id, user_id, job_titles, locations, environments, keywords, job_types, min_salary')
    .eq('is_active', true)

  if (profilesError) {
    console.error(`prospector-cron: failed to fetch profiles: ${profilesError.message}`)
    return new Response(
      JSON.stringify({ error: profilesError.message }),
      { status: 500, headers: jsonHeaders }
    )
  }

  if (!profiles || profiles.length === 0) {
    console.log('prospector-cron: no active profiles found — exiting')
    return new Response(
      JSON.stringify({ message: 'No active profiles', profiles_processed: 0 }),
      { status: 200, headers: jsonHeaders }
    )
  }

  console.log(`prospector-cron: processing ${profiles.length} active profile(s)`)

  const runAt = new Date().toISOString()
  const profileResults: Array<{ profile_id: string; status: string; jobs_found: number; jobs_queued: number }> = []

  for (const profile of profiles as ProspectingProfile[]) {
    let stats: RunStats

    try {
      stats = await runForProfile(profile, supabase, serpApiKey)
    } catch (err) {
      // Unexpected error in runForProfile itself — isolate and continue (BR-107 / per-profile isolation)
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`prospector-cron: unexpected error for profile ${profile.id}: ${msg}`)
      stats = {
        jobs_fetched_raw: 0,
        jobs_found: 0,
        jobs_queued: 0,
        status: 'error',
        errors: [msg],
      }
    }

    // Write prospecting_runs audit row (BR-106: even empty runs are recorded)
    const runRow = {
      profile_id: profile.id,
      user_id: profile.user_id,
      run_at: runAt,
      jobs_found: stats.jobs_found,
      jobs_queued: stats.jobs_queued,
      status: stats.status,
      error: stats.errors.length > 0 ? stats.errors.join(' | ') : null,
    }

    const { error: runInsertError } = await supabase
      .from('prospecting_runs')
      .insert(runRow)

    if (runInsertError) {
      // Log but do not abort — the jobs have already been upserted; losing the run record
      // is an audit gap but not a data corruption.
      console.error(
        `prospector-cron: failed to insert prospecting_run for profile ${profile.id}: ${runInsertError.message}`
      )
    }

    // Update last_run_at and next_run_at on the profile
    // next_run_at = 12 hours from now (twice-daily schedule, BR-100)
    const nextRunAt = new Date(Date.now() + 12 * 3_600_000).toISOString()

    const { error: profileUpdateError } = await supabase
      .from('prospecting_profiles')
      .update({ last_run_at: runAt, next_run_at: nextRunAt })
      .eq('id', profile.id)

    if (profileUpdateError) {
      console.error(
        `prospector-cron: failed to update profile timestamps for ${profile.id}: ${profileUpdateError.message}`
      )
    }

    profileResults.push({
      profile_id: profile.id,
      status: stats.status,
      jobs_found: stats.jobs_found,
      jobs_queued: stats.jobs_queued,
    })

    console.log(
      `prospector-cron: profile ${profile.id} complete — status=${stats.status}, ` +
      `jobs_fetched_raw=${stats.jobs_fetched_raw}, jobs_found=${stats.jobs_found}, ` +
      `jobs_queued=${stats.jobs_queued}`
    )
  }

  return new Response(
    JSON.stringify({
      message: 'prospector-cron complete',
      profiles_processed: profiles.length,
      results: profileResults,
    }),
    { status: 200, headers: jsonHeaders }
  )
})
