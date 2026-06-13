// BKT AI-Apply — client enqueue for the submission worker (ADR-006, Phase 4).
//
// This is the piece that turns an approval/score into a real `application_queue`
// row that the (dry-run-safe) submission worker drains. The client may only ever
// write the user-owned statuses `pending_approval`/`approved` (INSERT) or move a
// row to `cancelled` (UPDATE); the worker-only statuses
// `submitting`/`submitted`/`failed` are never written from here (RLS enforces
// this server-side regardless — BR-131).
//
// IMPORTANT (BR-131): client enqueue is a UX convenience only. The worker's
// `claim_submission` RE-VALIDATES threshold/credits/cap/pause/no-resubmit
// server-side before anything fires, so enqueuing `approved` never bypasses a
// guardrail. The threshold the decision helper uses comes from
// `user_settings.auto_submit_score_threshold` (never a literal — LSN-001).
import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'
import type { ReviewModeId } from '../../auto-apply/types'

type QueueRow = Database['public']['Tables']['application_queue']['Row']

/** Statuses a client is permitted to INSERT (never a worker-only status). */
export type ClientQueueStatus = 'pending_approval' | 'approved'

/** Who/what created the queue intent. */
export type QueuedBy = 'user' | 'assist_mode' | 'auto_mode'

/** The slice of the queue row the gate UI renders / acts on. */
export interface QueueEntry {
  id: string
  status: string
  queuedBy: string
  channel: string | null
  attempts: number
  lastError: string | null
  lastAttemptAt: string | null
  submittedAt: string | null
}

const PG_UNIQUE_VIOLATION = '23505'

/** Statuses the client may still move to `cancelled` via UPDATE (RLS-aligned). */
const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set<ClientQueueStatus>([
  'pending_approval',
  'approved',
])

function toQueueEntry(row: QueueRow): QueueEntry {
  return {
    id: row.id,
    status: row.status,
    queuedBy: row.queued_by,
    channel: row.channel,
    attempts: row.attempts,
    lastError: row.last_error,
    lastAttemptAt: row.last_attempt_at,
    submittedAt: row.submitted_at,
  }
}

/**
 * Read the user's current queue row for an application, or `null` if none.
 * User-scoped; RLS guarantees only the caller's row is visible.
 */
export async function fetchQueueEntry(
  userId: string,
  applicationId: string,
): Promise<QueueEntry | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('application_queue')
    .select(
      'id, status, queued_by, channel, attempts, last_error, last_attempt_at, submitted_at',
    )
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load submission queue entry: ${error.message}`)
  }
  if (!data) return null
  return toQueueEntry(data as QueueRow)
}

/**
 * Enqueue (or re-fetch, if already queued) an application for submission.
 *
 * `application_queue.application_id` is UNIQUE, so a second enqueue for the same
 * application would raise a 23505 unique violation. That is treated as
 * "already queued": the existing row is re-fetched and returned rather than
 * throwing. We never escalate to a worker-only status — `status` is constrained
 * to `pending_approval`/`approved` at the type level.
 */
export async function enqueueForSubmission(params: {
  userId: string
  applicationId: string
  status: ClientQueueStatus
  queuedBy: QueuedBy
}): Promise<QueueEntry> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('application_queue')
    .insert({
      user_id: params.userId,
      application_id: params.applicationId,
      status: params.status,
      queued_by: params.queuedBy,
    })
    .select(
      'id, status, queued_by, channel, attempts, last_error, last_attempt_at, submitted_at',
    )
    .single()

  if (error) {
    // Already queued (UNIQUE application_id) — re-fetch and return the live row.
    if (error.code === PG_UNIQUE_VIOLATION) {
      const existing = await fetchQueueEntry(params.userId, params.applicationId)
      if (existing) return existing
    }
    throw new Error(`Failed to enqueue application for submission: ${error.message}`)
  }

  return toQueueEntry(data as QueueRow)
}

/**
 * Cancel the user's queued intent for an application by moving it to
 * `cancelled`. RLS only permits this from `pending_approval`/`approved`, so a
 * row that is already `submitting`/`submitted`/`failed`/`cancelled` — or absent
 * — is a safe no-op. Returns the resulting entry, or `null` if there was
 * nothing cancellable.
 */
export async function cancelQueued(params: {
  userId: string
  applicationId: string
}): Promise<QueueEntry | null> {
  const supabase = getSupabaseClient()
  const existing = await fetchQueueEntry(params.userId, params.applicationId)
  if (!existing || !CANCELLABLE_STATUSES.has(existing.status)) {
    return null
  }

  const { data, error } = await supabase
    .from('application_queue')
    .update({ status: 'cancelled' })
    .eq('user_id', params.userId)
    .eq('application_id', params.applicationId)
    .select(
      'id, status, queued_by, channel, attempts, last_error, last_attempt_at, submitted_at',
    )
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to cancel queued submission: ${error.message}`)
  }
  if (!data) return null
  return toQueueEntry(data as QueueRow)
}

/**
 * Read the server-authoritative auto-submit score threshold for a user
 * (`user_settings.auto_submit_score_threshold`, default 80 per ADR-006). This
 * is the value the decision helper compares against — never a literal (LSN-001,
 * BR-131). Falls back to the default only when the row/column is unreadable.
 */
export async function fetchSubmitThreshold(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('user_settings')
    .select('auto_submit_score_threshold')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load submission threshold: ${error.message}`)
  }
  return data?.auto_submit_score_threshold ?? DEFAULT_SUBMIT_THRESHOLD
}

/** ADR-006 default, aligning with BR-021's packet-prep threshold. */
export const DEFAULT_SUBMIT_THRESHOLD = 80

/* ----------------------------- decision helper ---------------------------- */

export type QueueDecision =
  | { shouldEnqueue: true; status: 'approved' | 'pending_approval'; queuedBy: 'assist_mode' | 'auto_mode' }
  | { shouldEnqueue: false }

/**
 * PURE decision helper for the NON-explicit (autonomous) enqueue path, encoding
 * ADR-006 review-mode autonomy semantics (BR-130). The explicit human-approval
 * path is handled directly by the gate UI and does NOT route through this.
 *
 *  - `review`: never auto-enqueue — every submission needs explicit approval.
 *  - `assist`: score ≥ threshold → auto-queue as `approved` (`assist_mode`);
 *              otherwise wait for explicit approval.
 *  - `auto`:   score ≥ threshold → auto-queue as `approved` (`auto_mode`);
 *              otherwise wait for explicit approval.
 *
 * A null score never auto-enqueues. `threshold` is supplied by the caller from
 * `user_settings.auto_submit_score_threshold` (BR-131) — no literal lives here.
 */
export function decideQueueAction(input: {
  reviewMode: ReviewModeId
  matchScore: number | null
  threshold: number
}): QueueDecision {
  const { reviewMode, matchScore, threshold } = input

  if (reviewMode === 'review') {
    return { shouldEnqueue: false }
  }

  const atOrAboveThreshold = matchScore !== null && matchScore >= threshold
  if (!atOrAboveThreshold) {
    return { shouldEnqueue: false }
  }

  return {
    shouldEnqueue: true,
    status: 'approved',
    queuedBy: reviewMode === 'auto' ? 'auto_mode' : 'assist_mode',
  }
}
