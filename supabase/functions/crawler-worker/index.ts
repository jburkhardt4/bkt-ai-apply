/**
 * crawler-worker — Edge Function (ADR-015, Phase 3)
 *
 * Drains the crawl_jobs queue: claims a batch (claim_crawl_jobs, FOR UPDATE SKIP
 * LOCKED), and for each board fetches its public JSON list endpoint over plain
 * HTTP (Greenhouse / Lever / Ashby — Workday deferred), normalizes via the pure
 * _shared/crawl layer, and upserts into the shared corpus (upsert_job_postings,
 * no-churn). On a full successful enumeration it closes vanished postings
 * (close_missing_job_postings). Politeness is a per-host token bucket
 * (consume_crawl_token); 429/5xx back off; a 403/anti-bot block marks the board
 * 'blocked' and SKIPS — never a headless bypass (BR-032/033/034).
 *
 * Invoked by pg_cron via net.http_post (like gmail-sync / submission-worker).
 * CRON_SECRET gates the --no-verify-jwt endpoint when set; unset → warn + allow.
 * Service-role client only; all writes go through the service-role RPCs / RLS
 * bypass. Never imported by vitest (Deno-only).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { cronSecretConfigured, hasValidCronSecret } from '../_shared/cron-auth.ts'
import { buildListEndpoint, nextCursor } from '../_shared/crawl/listEndpoint.ts'
import { isCrawlable, parseList } from '../_shared/crawl/adapters/index.ts'
import type { Cursor } from '../_shared/crawl/types.ts'

const USER_AGENT =
  'BKT-AI-Apply-Crawler/1.0 (+https://bkt-ai-apply.vercel.app; contact: john@bktadvisory.com)'
const DEFAULT_BATCH = 10
const MAX_PAGES = 50 // safety cap on Lever pagination (≤ 5000 postings/board/run)
const MAX_ATTEMPTS = 5
const BACKOFF_BASE_SEC = 60
const RATE_WAIT_SEC = 60

// Conservative shared-API politeness defaults (per host).
const DEFAULT_RPS = 2
const DEFAULT_BURST = 5

class RetryableError extends Error {}
class BlockedError extends Error {}
class TerminalError extends Error {}

async function isCronAuthorized(req: Request): Promise<boolean> {
  if (await hasValidCronSecret(req)) return true
  if (!cronSecretConfigured()) {
    console.warn('crawler-worker: SECURITY — CRON_SECRET unset; allowing invocation. Set it to require auth.')
    return true
  }
  return false
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('crawler-worker: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function fetchList(url: string, method: 'GET' | 'POST', headers: Record<string, string>, body?: string) {
  return await fetch(url, {
    method,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    body,
  })
}

// ── crawl_jobs / ats_boards finalizers (service role bypasses RLS) ──────────
async function finalizeJob(supabase: SupabaseClient, id: string, fields: Record<string, unknown>) {
  await supabase.from('crawl_jobs').update(fields).eq('id', id)
}
async function rescheduleJob(
  supabase: SupabaseClient,
  jobId: string,
  delaySec: number,
  error: string,
  payload?: Record<string, unknown>,
) {
  const fields: Record<string, unknown> = {
    status: 'pending',
    locked_until: null,
    run_after: new Date(Date.now() + delaySec * 1000).toISOString(),
    last_error: error,
  }
  // Persist progress (cursor + accumulated seen) so a rate-limited reschedule
  // resumes mid-enumeration instead of restarting at page 0 and reprocessing the
  // first burst forever (never reaching later pages or the close-missing pass).
  if (payload) fields.payload = payload
  await supabase.from('crawl_jobs').update(fields).eq('id', jobId)
}
async function updateBoard(supabase: SupabaseClient, id: string, fields: Record<string, unknown>) {
  await supabase.from('ats_boards').update(fields).eq('id', id)
}
async function bumpBoardFailure(supabase: SupabaseClient, board: { id: string; consecutive_failures?: number }, status: string) {
  await supabase.from('ats_boards').update({
    last_status: status,
    consecutive_failures: (board.consecutive_failures ?? 0) + 1,
  }).eq('id', board.id)
}

interface CrawlJob {
  id: string
  board_id: string
  attempts?: number
  payload?: { cursor?: Cursor | null; seen?: string[] } | null
}

async function processJob(supabase: SupabaseClient, job: CrawlJob): Promise<Record<string, unknown>> {
  const { data: board, error } = await supabase.from('ats_boards').select('*').eq('id', job.board_id).single()
  if (error || !board) {
    await finalizeJob(supabase, job.id, { status: 'failed', last_error: `board load: ${error?.message ?? 'not found'}` })
    return { job_id: job.id, status: 'failed', reason: 'board_missing' }
  }
  if (!isCrawlable(board.ats_family)) {
    await finalizeJob(supabase, job.id, { status: 'blocked', last_error: `family ${board.ats_family} not crawlable (v1)` })
    await updateBoard(supabase, board.id, { last_status: 'blocked' })
    return { job_id: job.id, board: board.board_token, status: 'blocked', reason: 'not_crawlable' }
  }
  try {
    return { job_id: job.id, board: board.board_token, ...(await crawlBoard(supabase, board, job)) }
  } catch (err) {
    return await handleCrawlError(supabase, board, job, err)
  }
}

async function crawlBoard(
  supabase: SupabaseClient,
  board: { id: string; ats_family: string; board_token: string; display_name?: string | null; last_etag?: string | null },
  job: CrawlJob,
): Promise<Record<string, unknown>> {
  const first = buildListEndpoint(board)
  if (!first) throw new TerminalError('no list endpoint for family')
  const host = new URL(first.url).host

  // Resume from a persisted cursor/seen set (a prior run rescheduled mid-board on
  // a rate-limit). Accumulating `seen` across runs keeps close-missing correct.
  let cursor: Cursor | null = job.payload?.cursor ?? null
  let pages = 0
  let enumerated = true
  let unchanged304 = false
  let etag = board.last_etag ?? null
  const seen: string[] = [...(job.payload?.seen ?? [])]
  const counts = { inserted: 0, updated: 0, unchanged: 0, skipped: 0 }

  while (true) {
    if (pages >= MAX_PAGES) { enumerated = false; break }

    // Politeness gate (token bucket). Out of tokens → reschedule the whole job,
    // persisting cursor + seen so it resumes here; upserts already committed
    // persist and re-run idempotently.
    const { data: tokenOk, error: tErr } = await supabase.rpc('consume_crawl_token', {
      p_host: host, p_rps: DEFAULT_RPS, p_burst: DEFAULT_BURST,
    })
    if (tErr) throw new RetryableError(`token: ${tErr.message}`)
    if (tokenOk !== true) {
      await rescheduleJob(supabase, job.id, RATE_WAIT_SEC, 'rate_limited', { cursor, seen })
      return { status: 'rescheduled', reason: 'rate_limited', ...counts }
    }

    const req = buildListEndpoint(board, cursor)
    if (!req) break
    const res = await fetchList(req.url, req.method, req.headers ?? {}, req.body)
    pages++

    if (res.status === 304) { unchanged304 = true; enumerated = false; break }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`http ${res.status}`)
    if (res.status === 403) throw new BlockedError('http 403 (anti-bot) — skipping, no bypass')
    if (!res.ok) throw new TerminalError(`http ${res.status}`)

    if (pages === 1) etag = res.headers.get('etag') ?? etag

    const bodyJson = await res.json()
    const postings = parseList(board.ats_family, bodyJson, board)
    if (postings.length) {
      const { data: up, error: uErr } = await supabase.rpc('upsert_job_postings', {
        p_board_id: board.id, p_rows: postings,
      })
      if (uErr) throw new RetryableError(`upsert: ${uErr.message}`)
      counts.inserted += up?.inserted ?? 0
      counts.updated += up?.updated ?? 0
      counts.unchanged += up?.unchanged ?? 0
      counts.skipped += up?.skipped ?? 0
      for (const p of postings) seen.push(p.external_job_id)
    }

    const next = nextCursor(board.ats_family, bodyJson, cursor)
    if (!next) break
    cursor = next
  }

  // Close vanished postings ONLY on a full, successful enumeration that actually
  // returned at least one posting (never on a 304/partial/capped run, nor on an
  // empty enumeration) so neither a truncated fetch nor a transient HTTP-200
  // empty `jobs` array can mass-close a board's postings (ADR-015 #6).
  let closed = 0
  if (enumerated && !unchanged304 && seen.length > 0) {
    const { data: c, error: cErr } = await supabase.rpc('close_missing_job_postings', {
      p_board_id: board.id, p_seen: seen,
    })
    if (cErr) throw new RetryableError(`close: ${cErr.message}`)
    closed = c ?? 0
  } else if (enumerated && !unchanged304 && seen.length === 0) {
    // A full, successful crawl that returned ZERO postings. We deliberately do
    // NOT run close-missing here (Codex #1 / JB v1 decision): a transient HTTP-200
    // empty `jobs` array would otherwise mass-close every posting on the board.
    // Trade-off: a board that is genuinely empty keeps its old postings active
    // until a non-empty crawl re-confirms them or a human reviews it. Logged so
    // the skipped close is visible/auditable.
    console.warn(
      `crawler-worker: ${board.ats_family}/${board.board_token} — full crawl returned 0 postings; ` +
        `skipping close-missing to avoid mass-closure on a transient empty response.`,
    )
  }

  await updateBoard(supabase, board.id, {
    last_synced_at: new Date().toISOString(),
    last_status: enumerated || unchanged304 ? 'ok' : 'partial',
    last_etag: etag,
    consecutive_failures: 0,
  })
  await finalizeJob(supabase, job.id, { status: 'done', last_error: null })

  return { status: unchanged304 ? 'unchanged' : 'ok', pages, closed, ...counts }
}

async function handleCrawlError(
  supabase: SupabaseClient,
  board: { id: string; ats_family: string; board_token: string; consecutive_failures?: number },
  job: CrawlJob,
  err: unknown,
): Promise<Record<string, unknown>> {
  const msg = err instanceof Error ? err.message : String(err)

  if (err instanceof BlockedError) {
    await finalizeJob(supabase, job.id, { status: 'blocked', last_error: msg })
    await bumpBoardFailure(supabase, board, 'blocked')
    console.error(`crawler-worker: BLOCKED ${board.ats_family}/${board.board_token} — ${msg} (no bypass, BR-032/033/034)`)
    return { job_id: job.id, board: board.board_token, status: 'blocked', reason: msg }
  }

  if (err instanceof RetryableError) {
    const attempts = job.attempts ?? 1
    if (attempts >= MAX_ATTEMPTS) {
      await finalizeJob(supabase, job.id, { status: 'failed', last_error: `max attempts: ${msg}` })
      await bumpBoardFailure(supabase, board, 'error')
      return { job_id: job.id, board: board.board_token, status: 'failed', reason: msg }
    }
    const delay = BACKOFF_BASE_SEC * Math.pow(2, attempts)
    await rescheduleJob(supabase, job.id, delay, msg)
    return { job_id: job.id, board: board.board_token, status: 'retry', in_sec: delay, reason: msg }
  }

  // TerminalError / unknown — do not retry (e.g. 404 bad token, 4xx).
  await finalizeJob(supabase, job.id, { status: 'failed', last_error: msg })
  await bumpBoardFailure(supabase, board, 'error')
  return { job_id: job.id, board: board.board_token, status: 'failed', reason: msg }
}

async function runWorker(supabase: SupabaseClient, batch: number) {
  const { data: claimed, error } = await supabase.rpc('claim_crawl_jobs', { p_batch: batch })
  if (error) throw new Error(`claim_crawl_jobs: ${error.message}`)
  const jobs = (claimed ?? []) as CrawlJob[]
  const results: Record<string, unknown>[] = []
  for (const job of jobs) {
    results.push(await processJob(supabase, job))
  }
  return { claimed: jobs.length, results }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (!(await isCronAuthorized(req))) return json({ error: 'unauthorized' }, 401)

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    console.error(`crawler-worker: ${err instanceof Error ? err.message : 'setup error'}`)
    return json({ error: 'crawler-worker is not configured' }, 500)
  }

  let batch = DEFAULT_BATCH
  try {
    const body = await req.json()
    if (body && typeof body.batch === 'number') batch = Math.max(1, Math.min(50, Math.floor(body.batch)))
  } catch {
    // no/!json body — use default batch
  }

  try {
    const result = await runWorker(supabase, batch)
    console.log(`crawler-worker: claimed=${result.claimed}`)
    return json(result, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    console.error(`crawler-worker: ${msg}`)
    return json({ error: msg }, 500)
  }
})
