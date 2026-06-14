/**
 * submission-worker — Edge Function (Phase 4, ADR-006 / BR-130..136)
 *
 * Drains `approved` rows from `application_queue` and submits each real job
 * application through the resolved channel adapter (ATS API-first, browser
 * fallback). Scheduled like prospector-cron / gmail-sync via pg_cron →
 * net.http_post (see docs/deploy/submission-worker-setup.md).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SAFETY: this worker, when live, sends REAL job applications. It DEFAULTS   │
 * │ to a zero-side-effect DRY-RUN and only fires when SUBMISSION_LIVE='true'.  │
 * │ In dry-run it makes NO claim/charge/submit/finalize calls — it only counts │
 * │ approved rows (read-only) and returns the count. Do not change the default.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mirrors the prospector-cron / gmail-sync server-side scheduled-function shape:
 *   - service-role client from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *     (persistSession:false; key never leaves the runtime — BR-006)
 *   - @supabase/supabase-js from the deno.json import map
 *   - CORS_HEADERS + json() from _shared/http.ts; OPTIONS preflight short-circuit
 *   - Deno.serve(async (req) => Response); deployed --no-verify-jwt so pg_cron
 *     can invoke it without a user JWT (same as prospector-cron / gmail-sync).
 *     An optional CRON_SECRET (header 'x-cron-secret' or Authorization Bearer)
 *     gates the open endpoint when set; the service role is the trust anchor.
 *
 * The worker's ONLY DB mutations are the three service-role RPCs
 * (expire_stuck_submitting / claim_submission / finalize_submission). It writes
 * NO application_events and touches NO credits directly — the RPCs own all
 * mutations, guardrails (BR-131/132/135/136), and event sourcing (BR-002/133).
 * This is the LSN-004 atomicity rule: never split a multi-write across the wire.
 *
 * Claims are processed SEQUENTIALLY (no Promise.all): each claim charges a
 * credit and counts against the daily cap, so they must serialize per BR-136.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { resolveChannel } from '../_shared/submission/resolveChannel.ts'
import { atsAdapters } from '../_shared/submission/atsAdapters.ts'
import { browserAdapter } from '../_shared/submission/browserAdapter.ts'
import type { SubmissionInput, SubmissionOutcome } from '../_shared/submission/types.ts'

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 10

/** The kill-default safety gate — must be exactly the string 'true' to go live. */
function isLive(): boolean {
  return Deno.env.get('SUBMISSION_LIVE') === 'true'
}

function batchSize(): number {
  const raw = Deno.env.get('SUBMISSION_BATCH_SIZE')
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BATCH_SIZE
}

/**
 * Constant-time string equality. Both inputs are SHA-256 digested to fixed
 * 32-byte buffers first, then compared with a branchless XOR fold, so neither
 * the comparison time nor the loop length reveals anything about the secret
 * (including its length). Plain `===` short-circuits on the first differing
 * byte and can in theory leak timing about the secret. crypto.subtle is
 * available in the Deno edge runtime.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const av = new Uint8Array(ah)
  const bv = new Uint8Array(bh)
  let diff = 0
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i]
  return diff === 0
}

/**
 * Shared-secret gate for the scheduler (FIX 5 / FIX 6). The worker is deployed
 * with verify_jwt disabled (--no-verify-jwt) so pg_cron can invoke it without a user
 * JWT — matching prospector-cron / gmail-sync. To avoid leaving the endpoint
 * open, CRON_SECRET gates access:
 *   - If CRON_SECRET is SET, the request MUST carry it, either as the
 *     'x-cron-secret' header or as 'Authorization: Bearer <CRON_SECRET>';
 *     otherwise the request is rejected (401).
 *   - If CRON_SECRET is UNSET in dry-run mode, the request is allowed
 *     (backward-compatible / dry-run-safe — mirrors the pre-secret behavior).
 *   - If CRON_SECRET is UNSET in live mode (SUBMISSION_LIVE=true), the request
 *     is REJECTED (FIX 6). A live --no-verify-jwt endpoint must never be open;
 *     set CRON_SECRET to a long random value before enabling live submissions.
 * The secret is compared in constant time (timingSafeEqual).
 * Returns true when the request is authorized to proceed.
 */
async function isCronAuthorized(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return !isLive() // unset → open in dry-run only; fail closed in live mode

  const headerSecret = req.headers.get('x-cron-secret')
  if (headerSecret && (await timingSafeEqual(headerSecret, secret))) return true

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (authHeader && (await timingSafeEqual(authHeader, `Bearer ${secret}`))) return true

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

/** Minimal queue row we select for the live batch. */
interface QueueRow {
  id: string
}

// ---------------------------------------------------------------------------
// Adapter dispatch
// ---------------------------------------------------------------------------

/**
 * Selects + runs the adapter for a claimed row. Pure orchestration: resolves the
 * channel, picks the adapter, and returns its outcome. Throwing is the caller's
 * concern — but adapters are written not to throw for expected conditions.
 */
async function submitViaChannel(input: SubmissionInput): Promise<SubmissionOutcome> {
  const { channel, vendor } = resolveChannel(input.applicationMethod, input.sourceUrl)

  // ATS vendor present → addressable ATS adapter.
  if (vendor) {
    return await atsAdapters[vendor](input)
  }

  // No vendor: browser fallback for 'browser', explicit failure for 'manual'.
  if (channel === 'browser') {
    return await browserAdapter(input)
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

/** Max finalize attempts on a SUCCESS outcome before giving up (FIX 4). */
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
 * Finalizes a claimed row. The finalize RPC is idempotent (it only acts on a
 * row in 'submitting'), so retrying a SUCCESS outcome cannot double-charge or
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

  // (b) Pull the batch of approved rows, oldest first.
  const { data: rows, error: selectError } = await supabase
    .from('application_queue')
    .select('id')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(batchSize())

  if (selectError) {
    throw new Error(`select approved queue rows failed: ${selectError.message}`)
  }

  const queue = (rows ?? []) as QueueRow[]
  const skipped: Array<{ id: string; reason: string }> = []
  let submitted = 0
  let failed = 0
  let processed = 0

  // (c) SEQUENTIAL — claims charge credits + count toward the daily cap; never
  // parallelize (BR-136 accounting must not be raced).
  for (const row of queue) {
    // Claim (re-validates ALL guardrails server-side + charges the credit).
    const { data: claimData, error: claimError } = await supabase.rpc('claim_submission', {
      p_queue_id: row.id,
    })

    if (claimError) {
      // RPC-level failure: do not finalize (nothing was claimed). Record + move on.
      console.error(`submission-worker: claim_submission(${row.id}) error: ${claimError.message}`)
      skipped.push({ id: row.id, reason: 'claim_error' })
      continue
    }

    const claim = claimData as ClaimResult
    if (!claim || claim.ok !== true) {
      // Guard failure (paused / no_credits / daily_cap / already_submitted / …).
      // The RPC already left the row approved (transient) or cancelled (terminal).
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

    // Run the channel adapter, wrapped so one row can never crash the batch.
    let outcome: SubmissionOutcome
    try {
      outcome = await submitViaChannel(input)
    } catch (err) {
      const { channel } = resolveChannel(input.applicationMethod, input.sourceUrl)
      outcome = {
        success: false,
        channel,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // Finalize EXACTLY once per claimed row (RPC refunds the credit on failure,
    // transitions discovery->applied + writes events on success). The RPC is
    // idempotent (only acts on rows in 'submitting'), so a retried success
    // call is safe. On a SUCCESS outcome we retry a transient finalize blip up
    // to FINALIZE_MAX_ATTEMPTS so a real submission is not stranded by a DB
    // hiccup; on a FAILURE outcome a single call suffices (refund/mark-failed).
    const finalizeError = await finalizeWithRetry(supabase, row.id, outcome)

    if (finalizeError) {
      if (outcome.success) {
        // A real submission was sent but we could NOT record it after retries.
        // Log loudly — expire_stuck_submitting is the backstop: it will move
        // the still-'submitting' row to terminal 'failed' (outcome=unconfirmed)
        // for manual reconciliation, never auto-resubmitting it.
        console.error(
          `submission-worker: CRITICAL finalize_submission(${row.id}) failed after retries ` +
            `on a SUCCESSFUL submission — manual reconciliation required: ${finalizeError.message}`,
        )
      } else {
        // Failure-outcome finalize blip: expire_stuck_submitting reclaims later.
        console.error(`submission-worker: finalize_submission(${row.id}) error: ${finalizeError.message}`)
      }
    }

    if (outcome.success) submitted += 1
    else failed += 1
  }

  return { mode: 'live', processed, submitted, failed, skipped, expiredStuck }
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
    message: 'Set SUBMISSION_LIVE=true to enable real submissions.',
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

  // FIX 8 (P1): fail closed in live mode without a scheduler secret. The
  // function is deployed --no-verify-jwt, so when CRON_SECRET is unset the
  // endpoint is publicly invokable. That is tolerable ONLY in dry-run (the
  // worker just counts approved rows, zero side effects). If SUBMISSION_LIVE=
  // 'true' with no CRON_SECRET, any caller could drain approved rows and trigger
  // REAL submissions outside the scheduler — so we refuse to run rather than
  // leave a live, unauthenticated endpoint open.
  if (isLive() && !Deno.env.get('CRON_SECRET')) {
    console.error(
      'submission-worker: refusing to run — SUBMISSION_LIVE=true requires CRON_SECRET ' +
        'to gate the --no-verify-jwt endpoint. Set CRON_SECRET (and the matching ' +
        'x-cron-secret header on the pg_cron call) before enabling live mode.',
    )
    return json(
      { error: 'submission-worker is misconfigured: live mode requires CRON_SECRET' },
      503,
    )
  }

  // FIX 5: scheduler shared-secret gate. The function is deployed
  // --no-verify-jwt, so this is the only auth on the endpoint when CRON_SECRET
  // is set. Checked before any work (and before touching the service-role key).
  if (!(await isCronAuthorized(req))) {
    return json({ error: 'unauthorized' }, 401)
  }

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    // Top-level setup failure (missing env) → generic 500, never leak secrets.
    const msg = err instanceof Error ? err.message : 'setup error'
    console.error(`submission-worker: ${msg}`)
    return json({ error: 'submission-worker is not configured' }, 500)
  }

  try {
    if (!isLive()) {
      const result = await runDry(supabase)
      console.log(`submission-worker: dry-run — ${result.approvedCount} approved row(s) pending`)
      return json(result, 200)
    }

    const result = await runLive(supabase)
    console.log(
      `submission-worker: live — processed=${result.processed}, submitted=${result.submitted}, ` +
        `failed=${result.failed}, skipped=${result.skipped.length}, expiredStuck=${result.expiredStuck}`,
    )
    return json(result, 200)
  } catch (err) {
    // Normalize any top-level run error; never leak internals/secrets.
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`submission-worker: run failed: ${msg}`)
    return json({ error: 'submission-worker run failed' }, 500)
  }
})
