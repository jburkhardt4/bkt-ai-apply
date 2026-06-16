/**
 * submission-worker — Edge Function (Phase 4, ADR-006 / BR-130..136)
 *
 * Drains `approved` rows from `application_queue` and submits each real job
 * application through the resolved channel adapter (ATS API-first, browser
 * fallback). Scheduled like prospector-cron / gmail-sync via pg_cron →
 * net.http_post (see docs/deploy/submission-worker-setup.md).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SAFETY: three modes, kill-default to a zero-side-effect DRY-RUN.           │
 * │   • dry-run (default)   — counts approved rows. No claim/charge/submit.    │
 * │   • shadow (SUBMISSION_SHADOW='true') — builds the REAL ATS request +      │
 * │     résumé and SAVES it to submission_previews for review. POSTs nothing,  │
 * │     claims/charges nothing. The pre-go-live validation gate (2026-06-14).  │
 * │   • live (SUBMISSION_LIVE='true') — sends REAL applications. Live wins if  │
 * │     both flags are set. Do not change the default.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mirrors the prospector-cron / gmail-sync server-side scheduled-function shape:
 *   - service-role client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *     (persistSession:false; key never leaves the runtime — BR-006)
 *   - @supabase/supabase-js from the deno.json import map
 *   - CORS_HEADERS + json() from _shared/http.ts; OPTIONS preflight short-circuit
 *   - Deno.serve(async (req) => Response); deployed --no-verify-jwt so pg_cron
 *     can invoke it without a user JWT. An optional CRON_SECRET (header
 *     'x-cron-secret' or Authorization Bearer) gates the open endpoint when set.
 *
 * In LIVE mode the worker's only DB mutations are the three service-role RPCs
 * (expire_stuck_submitting / claim_submission / finalize_submission) — the RPCs
 * own all guardrails (BR-131/132/135/136) and event sourcing (BR-002/133). The
 * worker additionally downloads the candidate profile + résumé (read-only) to
 * feed the adapters, and notifies the user on success (best-effort, post-finalize).
 * Claims are processed SEQUENTIALLY (each charges a credit + counts toward the
 * daily cap, so they must serialize per BR-136).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { cronSecretConfigured, hasValidCronSecret } from '../_shared/cron-auth.ts'
import { resolveChannel } from '../_shared/submission/resolveChannel.ts'
import { atsAdapters, buildAtsRequest } from '../_shared/submission/atsAdapters.ts'
import { browserAdapter } from '../_shared/submission/browserAdapter.ts'
import { getCandidateCached, makeCandidateCache } from '../_shared/submission/candidate.ts'
import { notifyAutoApplyOutcome } from '../_shared/notify.ts'
import type {
  BuiltRequest,
  CandidatePayload,
  SubmissionInput,
  SubmissionOutcome,
} from '../_shared/submission/types.ts'

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 10
// How many approved rows to scan per tick. Must be > 1 to scan past unclaimable
// rows (paused/no-credit/daily-cap) without exceeding batchSize() actual claims.
const SCAN_MULTIPLIER = 4

/** The kill-default safety gate — must be exactly the string 'true' to go live. */
function isLive(): boolean {
  return Deno.env.get('SUBMISSION_LIVE') === 'true'
}

/** Shadow-validate mode: build the real ATS request + résumé and SAVE it to
 *  submission_previews for review, but POST nothing and claim/charge nothing.
 *  Ignored when SUBMISSION_LIVE='true' (live wins). */
function isShadow(): boolean {
  return Deno.env.get('SUBMISSION_SHADOW') === 'true'
}

function batchSize(): number {
  const raw = Deno.env.get('SUBMISSION_BATCH_SIZE')
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BATCH_SIZE
}

/**
 * Shared-secret gate for the scheduler. The worker is deployed --no-verify-jwt
 * so pg_cron can invoke it without a user JWT. CRON_SECRET gates access:
 *   - If SET, the request MUST carry it ('x-cron-secret' header or
 *     'Authorization: Bearer <CRON_SECRET>'); else rejected (401).
 *   - If UNSET and NOT live (dry-run / shadow), the request is allowed
 *     (no external submission happens in those modes).
 *   - If UNSET and live, the request is REJECTED at the handler (fail closed).
 * Returns true when the request is authorized to proceed.
 */
async function isCronAuthorized(req: Request): Promise<boolean> {
  if (await hasValidCronSecret(req)) return true
  // CRON_SECRET unset → open in dry-run/shadow only; fail closed in live mode.
  if (!cronSecretConfigured()) return !isLive()
  return false
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('submission-worker: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// ---------------------------------------------------------------------------
// RPC payload shapes (the contract from migration 20260613000004)
// ---------------------------------------------------------------------------

/** claim_submission ok:true payload. */
interface ClaimOk {
  ok: true
  application_id: string
  job_id: string
  source_url: string
  application_method: string | null
  queued_by: string
}

/** claim_submission ok:false payload. reason ∈ the documented guard codes. */
interface ClaimFail {
  ok: false
  reason: string
}

type ClaimResult = ClaimOk | ClaimFail

/** Minimal queue row we select for the live batch (user_id drives candidate lookup). */
interface QueueRow {
  id: string
  user_id: string
}

// ---------------------------------------------------------------------------
// Adapter dispatch
// ---------------------------------------------------------------------------

/**
 * Selects + runs the adapter for a claimed row. Pure orchestration: resolves the
 * channel, picks the adapter, and returns its outcome. Adapters are written not
 * to throw for expected conditions; the caller also wraps this in try/catch.
 */
async function submitViaChannel(
  input: SubmissionInput,
  candidate: CandidatePayload | null,
): Promise<SubmissionOutcome> {
  const { channel, vendor } = resolveChannel(input.applicationMethod, input.sourceUrl)

  // ATS vendor present → addressable ATS adapter.
  if (vendor) {
    return await atsAdapters[vendor](input, candidate)
  }

  // No vendor: browser fallback for 'browser', explicit failure for 'manual'.
  if (channel === 'browser') {
    return await browserAdapter(input, candidate)
  }

  // channel === 'manual' (or any residual) → immediate manual-required failure.
  return { success: false, channel: 'manual', error: 'manual_required' }
}

// ---------------------------------------------------------------------------
// Live run
// ---------------------------------------------------------------------------

interface LiveResult {
  mode: 'live'
  processed: number
  submitted: number
  failed: number
  skipped: Array<{ id: string; reason: string }>
  expiredStuck: number
}

/** Max finalize attempts on a SUCCESS outcome before giving up. */
const FINALIZE_MAX_ATTEMPTS = 3
/** Base backoff between finalize retries (ms); grows linearly per attempt. */
const FINALIZE_BACKOFF_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Minimal shape of a Supabase RPC error we care about. */
interface RpcError {
  message: string
}

/**
 * Finalizes a claimed row. The finalize RPC is idempotent (it only acts on a row
 * in 'submitting'), so retrying a SUCCESS outcome cannot double-charge or
 * double-transition. A transient DB error on a successful submission must not
 * strand the row, so we retry up to FINALIZE_MAX_ATTEMPTS with a short linear
 * backoff. A FAILURE outcome is finalized in a single attempt (the stuck-row
 * expiry path is the backstop). Returns the last error, or null on success.
 */
async function finalizeWithRetry(
  supabase: SupabaseClient,
  queueId: string,
  outcome: SubmissionOutcome,
): Promise<RpcError | null> {
  const maxAttempts = outcome.success ? FINALIZE_MAX_ATTEMPTS : 1
  let lastError: RpcError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { error } = await supabase.rpc('finalize_submission', {
      p_queue_id: queueId,
      p_success: outcome.success,
      p_channel: outcome.channel,
      p_error: outcome.error ?? null,
      p_metadata: outcome.metadata ?? {},
    })

    if (!error) return null
    lastError = error

    if (attempt < maxAttempts) {
      console.error(
        `submission-worker: finalize_submission(${queueId}) attempt ${attempt}/${maxAttempts} ` +
          `failed: ${error.message} — retrying`,
      )
      await sleep(FINALIZE_BACKOFF_MS * attempt)
    }
  }

  return lastError
}

async function runLive(supabase: SupabaseClient): Promise<LiveResult> {
  // (a) Self-heal any rows a crashed prior run left stuck in 'submitting'.
  let expiredStuck = 0
  {
    const { data, error } = await supabase.rpc('expire_stuck_submitting')
    if (error) {
      console.error(`submission-worker: expire_stuck_submitting failed: ${error.message}`)
    } else if (typeof data === 'number') {
      expiredStuck = data
    }
  }

  // (b) Pull a wider scan window so unclaimable rows in the front of the queue do
  // not stall newer claimable rows. We stop once batchSize() rows are claimed.
  const { data: rows, error: selectError } = await supabase
    .from('application_queue')
    .select('id, user_id')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(batchSize() * SCAN_MULTIPLIER)

  if (selectError) {
    throw new Error(`select approved queue rows failed: ${selectError.message}`)
  }

  const queue = (rows ?? []) as QueueRow[]
  const candidateCache = makeCandidateCache()
  const skipped: Array<{ id: string; reason: string }> = []
  let submitted = 0
  let failed = 0
  let processed = 0

  // (c) SEQUENTIAL — claims charge credits + count toward the daily cap; never
  // parallelize (BR-136 accounting must not be raced). Stop once batchSize()
  // rows have been claimed so the per-tick submission limit is respected.
  for (const row of queue) {
    if (processed >= batchSize()) break
    // Claim (re-validates ALL guardrails server-side + charges the credit).
    const { data: claimData, error: claimError } = await supabase.rpc('claim_submission', {
      p_queue_id: row.id,
    })

    if (claimError) {
      console.error(`submission-worker: claim_submission(${row.id}) error: ${claimError.message}`)
      skipped.push({ id: row.id, reason: 'claim_error' })
      continue
    }

    const claim = claimData as ClaimResult
    if (!claim || claim.ok !== true) {
      // Guard failure (paused / no_credits / daily_cap / already_submitted / …).
      skipped.push({ id: row.id, reason: claim?.reason ?? 'not_claimable' })
      continue
    }

    processed += 1

    const input: SubmissionInput = {
      applicationId: claim.application_id,
      jobId: claim.job_id,
      sourceUrl: claim.source_url,
      applicationMethod: claim.application_method,
      queuedBy: claim.queued_by,
    }

    // Read-only: candidate profile + résumé bytes for this row's user (cached).
    const candidate = await getCandidateCached(supabase, row.user_id, candidateCache)

    // Run the channel adapter, wrapped so one row can never crash the batch.
    let outcome: SubmissionOutcome
    try {
      outcome = await submitViaChannel(input, candidate)
    } catch (err) {
      const { channel } = resolveChannel(input.applicationMethod, input.sourceUrl)
      outcome = {
        success: false,
        channel,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // Finalize EXACTLY once per claimed row (RPC refunds the credit on failure,
    // transitions discovery->applied + writes events on success). Idempotent, so
    // a retried success call is safe.
    const finalizeError = await finalizeWithRetry(supabase, row.id, outcome)

    if (finalizeError) {
      if (outcome.success) {
        console.error(
          `submission-worker: CRITICAL finalize_submission(${row.id}) failed after retries ` +
            `on a SUCCESSFUL submission — manual reconciliation required: ${finalizeError.message}`,
        )
      } else {
        console.error(`submission-worker: finalize_submission(${row.id}) error: ${finalizeError.message}`)
      }
    }

    if (outcome.success) {
      submitted += 1
      // Notify JB of the successful auto-apply (best-effort; never affects the run).
      await notifyAutoApplyOutcome(
        supabase,
        { userId: row.user_id, applicationId: input.applicationId, jobId: input.jobId, channel: outcome.channel },
        true,
      )
    } else {
      failed += 1
    }
  }

  return { mode: 'live', processed, submitted, failed, skipped, expiredStuck }
}

// ---------------------------------------------------------------------------
// Shadow run — build the real request + résumé, SAVE for review, POST nothing
// ---------------------------------------------------------------------------

interface ShadowResult {
  mode: 'shadow'
  previewed: number
  skipped: Array<{ id: string; reason: string }>
}

/** Supabase nested-select relations come back as object or single-element array. */
function normalizeOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return null
}

async function runShadow(supabase: SupabaseClient): Promise<ShadowResult> {
  // Read approved rows + the job context needed to BUILD the request (no mutation).
  const { data: rows, error } = await supabase
    .from('application_queue')
    .select(
      'id, user_id, application_id, queued_by, applications!inner(job_id, jobs!inner(source_url, application_method))',
    )
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(batchSize() * SCAN_MULTIPLIER)

  if (error) {
    throw new Error(`shadow scan failed: ${error.message}`)
  }

  const candidateCache = makeCandidateCache()
  const skipped: Array<{ id: string; reason: string }> = []
  let previewed = 0

  for (const raw of (rows ?? []) as Array<Record<string, unknown>>) {
    const id = raw.id as string
    const userId = raw.user_id as string
    const applicationId = raw.application_id as string
    const queuedBy = (raw.queued_by as string) ?? 'user'

    const app = normalizeOne(raw.applications)
    const job = app ? normalizeOne(app.jobs) : null
    const jobId = (app?.job_id as string | undefined) ?? null
    const sourceUrl = (job?.source_url as string | undefined) ?? ''
    const applicationMethod = (job?.application_method as string | null | undefined) ?? null

    if (!jobId || !sourceUrl) {
      skipped.push({ id, reason: 'missing_job_context' })
      continue
    }

    const input: SubmissionInput = {
      applicationId,
      jobId,
      sourceUrl,
      applicationMethod,
      queuedBy,
    }
    const candidate = await getCandidateCached(supabase, userId, candidateCache)
    const { channel, vendor } = resolveChannel(applicationMethod, sourceUrl)

    let built: BuiltRequest
    if (vendor) {
      built = buildAtsRequest(vendor, input, candidate)
    } else if (channel === 'browser') {
      built = {
        channel: 'browser',
        vendor: null,
        endpoint: null,
        payload: { sourceUrl },
        resumePath: candidate?.resumePath ?? null,
        missing: ['browser_channel_deferred_4_1'],
      }
    } else {
      built = {
        channel: 'manual',
        vendor: null,
        endpoint: null,
        payload: { sourceUrl },
        resumePath: candidate?.resumePath ?? null,
        missing: ['manual_required'],
      }
    }

    const { error: upsertError } = await supabase.from('submission_previews').upsert(
      {
        user_id: userId,
        application_id: applicationId,
        job_id: jobId,
        channel: built.channel,
        vendor: built.vendor,
        endpoint: built.endpoint,
        request_payload: built.payload,
        resume_path: built.resumePath,
        missing: built.missing,
        status: 'pending_review',
      },
      { onConflict: 'application_id' },
    )

    if (upsertError) {
      skipped.push({ id, reason: `preview_upsert_failed: ${upsertError.message}` })
      continue
    }
    previewed += 1
  }

  return { mode: 'shadow', previewed, skipped }
}

// ---------------------------------------------------------------------------
// Dry run (DEFAULT — zero side effects)
// ---------------------------------------------------------------------------

interface DryRunResult {
  mode: 'dry_run'
  approvedCount: number
  message: string
}

async function runDry(supabase: SupabaseClient): Promise<DryRunResult> {
  // Read-only count of what WOULD be processed. No claim/charge/submit/finalize.
  const { count, error } = await supabase
    .from('application_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  if (error) {
    throw new Error(`dry-run count failed: ${error.message}`)
  }

  return {
    mode: 'dry_run',
    approvedCount: count ?? 0,
    message: 'Set SUBMISSION_SHADOW=true to preview requests, or SUBMISSION_LIVE=true to submit.',
  }
}

// ---------------------------------------------------------------------------
// Handler — mirrors prospector-cron / gmail-sync auth + invocation + response
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight (required for supabase.functions.invoke()).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Fail closed in live mode without a scheduler secret. The function is deployed
  // --no-verify-jwt, so when CRON_SECRET is unset the endpoint is publicly
  // invokable. That is tolerable in dry-run/shadow (no external submission), but
  // a live unauthenticated endpoint must never be open.
  if (isLive() && !Deno.env.get('CRON_SECRET')) {
    console.error(
      'submission-worker: refusing to run — SUBMISSION_LIVE=true requires CRON_SECRET ' +
        'to gate the --no-verify-jwt endpoint.',
    )
    return json(
      { error: 'submission-worker is misconfigured: live mode requires CRON_SECRET' },
      503,
    )
  }

  // Scheduler shared-secret gate (the only auth on the endpoint when set).
  if (!(await isCronAuthorized(req))) {
    return json({ error: 'unauthorized' }, 401)
  }

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'setup error'
    console.error(`submission-worker: ${msg}`)
    return json({ error: 'submission-worker is not configured' }, 500)
  }

  try {
    // Mode precedence: live > shadow > dry-run (kill-default).
    if (isLive()) {
      const result = await runLive(supabase)
      console.log(
        `submission-worker: live — processed=${result.processed}, submitted=${result.submitted}, ` +
          `failed=${result.failed}, skipped=${result.skipped.length}, expiredStuck=${result.expiredStuck}`,
      )
      return json(result, 200)
    }

    if (isShadow()) {
      const result = await runShadow(supabase)
      console.log(
        `submission-worker: shadow — previewed=${result.previewed}, skipped=${result.skipped.length}`,
      )
      return json(result, 200)
    }

    const result = await runDry(supabase)
    console.log(`submission-worker: dry-run — ${result.approvedCount} approved row(s) pending`)
    return json(result, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`submission-worker: run failed: ${msg}`)
    return json({ error: 'submission-worker run failed' }, 500)
  }
})
