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
 *   - Deno.serve(async (req) => Response); invoked unauthenticated by the
 *     scheduler (same as prospector-cron) — the service role is the trust anchor
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
    // transitions discovery->applied + writes events on success).
    const { error: finalizeError } = await supabase.rpc('finalize_submission', {
      p_queue_id: row.id,
      p_success: outcome.success,
      p_channel: outcome.channel,
      p_error: outcome.error ?? null,
      p_metadata: outcome.metadata ?? {},
    })

    if (finalizeError) {
      // The submission may have happened but we could not record the outcome.
      // expire_stuck_submitting will reclaim/refund the row on a later run.
      console.error(`submission-worker: finalize_submission(${row.id}) error: ${finalizeError.message}`)
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
