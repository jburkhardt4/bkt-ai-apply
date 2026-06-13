/**
 * Submission channel contracts (ADR-006 / BR-130..136).
 *
 * Shared types for the Phase 4 submission worker and its channel adapters.
 * These are pure type declarations — no runtime, no imports — so they are safe
 * to pull into the worker, the adapters, and (future) unit tests alike.
 *
 * The worker's ONLY DB mutations happen through the three service-role RPCs
 * (claim_submission / finalize_submission / expire_stuck_submitting). An adapter
 * never touches the database: it receives a SubmissionInput, attempts the real
 * channel work, and returns a SubmissionOutcome the worker hands to
 * finalize_submission. The RPC owns event sourcing + guardrails (LSN-004).
 */

/** The channel an outcome was produced on. Mirrors application_queue.channel. */
export type SubmissionChannel = 'api' | 'ats' | 'browser' | 'manual'

/** The ATS vendors with documented public application endpoints (GAP-010). */
export type AtsVendor = 'greenhouse' | 'lever' | 'ashby'

/**
 * Everything an adapter needs to attempt one submission. Sourced verbatim from
 * the `claim_submission` ok:true payload (plus camelCasing) — the worker does
 * not enrich it. Keeping the shape flat and serializable keeps adapters pure.
 */
export interface SubmissionInput {
  /** applications.id — the application being submitted. */
  applicationId: string
  /** jobs.id — the posting being applied to. */
  jobId: string
  /** jobs.source_url — canonical apply URL; drives ATS vendor detection. */
  sourceUrl: string
  /** jobs.application_method — 'api' | 'ats' | 'manual' | null. */
  applicationMethod: string | null
  /** application_queue.queued_by — 'user' | 'assist_mode' | 'auto_mode'. */
  queuedBy: string
}

/**
 * The result of one adapter attempt. `metadata` carries audit artifacts that
 * finalize_submission folds into the application_events row, e.g. the ATS
 * vendor, a Browserbase session id, or a screenshot URL on failure. Adapters
 * must never throw for an expected "not configured" / "manual required"
 * condition — they encode it here as a structured failure outcome.
 */
export interface SubmissionOutcome {
  success: boolean
  channel: SubmissionChannel
  /** Short machine-readable reason on failure (e.g. 'channel_not_configured'). */
  error?: string
  /** Audit artifacts — vendor, session ids, screenshot URLs, notes. */
  metadata?: Record<string, unknown>
}

/** A channel adapter: pure async function from input to outcome. Never throws
 *  for expected conditions — the worker also wraps every call in try/catch as a
 *  belt-and-suspenders guard so one row can never crash the batch. */
export type SubmissionAdapter = (input: SubmissionInput) => Promise<SubmissionOutcome>
