// BKT AI-Apply — Prospector → pipeline graduation.
//
// Bridges the gap between *scored* prospector jobs and the *applications*
// pipeline. Scoring (ai_scores) alone never created an application, so the
// "Ready to Apply" queue (which reads applications.match_score >= 60 for
// source='prospector') stayed empty even when strong matches existed. This
// service graduates those scored jobs into the pipeline and, for assist/auto
// review modes, enqueues the qualifying ones for the submission worker.
//
// Rules:
//   BR-004 — all DB access via getSupabaseClient()
//   BR-005 — every query filters by user_id
//   BR-020 / BR-105 — match_score >= 60, source IN ('prospector','corpus')
//   BR-130 / BR-131 — mode-based autonomy via decideQueueAction; the worker's
//                     claim_submission still re-validates server-side, so
//                     enqueuing 'approved' never bypasses a guardrail.
import { getSupabaseClientSafe } from '@/lib/supabase'
import type { ReviewModeId } from '@/features/auto-apply/types'
import {
  decideQueueAction,
  enqueueForSubmission,
  fetchSubmitThreshold,
} from '@/features/applications/services/submissionQueueService'
import {
  assessEligibility,
  deriveEligibilityProfile,
  effectiveScore,
  type CandidateProfileEligibilityRow,
} from '@/features/auto-apply/services/eligibilityService'

/** Pipeline-entry threshold — matches useProspectorReadyQueue (BR-020). */
const READY_QUEUE_MIN_SCORE = 60

export interface GraduationResult {
  /** Applications newly created at the discovery stage. */
  created: number
  /** Qualifying matches enqueued (assist/auto modes only). */
  enqueued: number
}

interface ScoreRow {
  job_id: string
  overall_score: number
  scored_at: string
}

/**
 * Graduates scored prospector jobs into the application pipeline.
 *
 * 1. Any prospector job whose latest ai_score is >= 60 and which has no
 *    application yet gets a discovery-stage application carrying that score
 *    (so the Ready Queue surfaces it). The DB stage-transition trigger writes
 *    the application_events row — same path the ingestion flow relies on.
 * 2. Mode-specific auto-enqueue (decideQueueAction, BR-130): auto mode enqueues
 *    every prospector application at/above the pipeline floor (READY_QUEUE_MIN_SCORE);
 *    assist (Hybrid) enqueues only those at/above the user's
 *    auto_submit_score_threshold; review mode enqueues nothing. Enqueue is
 *    idempotent — application_queue.application_id is UNIQUE — so re-running is safe.
 *
 * Idempotent end-to-end: only missing applications are created and duplicate
 * enqueues are absorbed. Safe to call on dashboard load and after scoring.
 */
export async function graduateProspectorMatches(params: {
  userId: string
  reviewMode: ReviewModeId
}): Promise<GraduationResult> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) return { created: 0, enqueued: 0 }
  const { userId, reviewMode } = params

  // All scores for this user's prospector + corpus jobs, newest first. No score-threshold
  // filter here — we need ALL rows so we can pick the latest per job (not the
  // highest). Applying gte(60) before we've isolated the latest row would let
  // an old high score shadow a more-recent low score, graduating a job that has
  // since been rescored below the threshold.
  const { data: scoreRows, error: scoreError } = await supabase
    .from('ai_scores')
    .select('job_id, overall_score, scored_at, jobs!inner(source)')
    .eq('user_id', userId)
    .in('jobs.source', ['prospector', 'corpus'])
    .order('scored_at', { ascending: false })

  if (scoreError) {
    throw new Error(`Graduation score scan failed: ${scoreError.message}`)
  }

  // Take the latest score per job (first occurrence, since rows are scored_at DESC),
  // then apply the ready-queue threshold so only current >= 60 scores are graduated.
  // `seen` is marked on the FIRST (latest) row for each job regardless of its value,
  // so a stale higher score can never shadow a more-recent sub-threshold one: a job
  // rescored 85 -> 45 must NOT graduate at 85 (BR-020 latest-score-wins).
  const bestByJob = new Map<string, number>()
  const seen = new Set<string>()
  for (const raw of (scoreRows ?? []) as unknown as ScoreRow[]) {
    if (seen.has(raw.job_id)) continue  // keep only the latest row per job
    seen.add(raw.job_id)
    if (raw.overall_score >= READY_QUEUE_MIN_SCORE) {
      bestByJob.set(raw.job_id, raw.overall_score)
    }
  }
  if (bestByJob.size === 0) return { created: 0, enqueued: 0 }

  // Hard eligibility / location gate (dashboard-uat-audit §6 #2): drop postings
  // that explicitly exclude the candidate and demote geographically-mismatched
  // roles below the ready floor, BEFORE any application is created.
  await applyEligibilityGate(supabase, userId, bestByJob)
  if (bestByJob.size === 0) return { created: 0, enqueued: 0 }

  const jobIds = [...bestByJob.keys()]

  // Which of these jobs already have an application?
  const { data: existingApps, error: appErr } = await supabase
    .from('applications')
    .select('id, job_id')
    .eq('user_id', userId)
    .in('job_id', jobIds)

  if (appErr) {
    throw new Error(`Graduation application scan failed: ${appErr.message}`)
  }

  const appIdByJob = new Map<string, string>()
  for (const a of (existingApps ?? []) as { id: string; job_id: string }[]) {
    appIdByJob.set(a.job_id, a.id)
  }

  // 1. Create missing applications at discovery, carrying the score. Insert
  //    one-by-one so a single concurrent-create conflict (23505) doesn't abort
  //    the batch — it's fetched and treated as already-present.
  let created = 0
  for (const jobId of jobIds) {
    if (appIdByJob.has(jobId)) {
      // Sync the latest qualifying score onto the existing application so
      // useProspectorReadyQueue (match_score >= 60) and claim_submission both
      // see the current score. Silently ignore errors — best-effort update.
      await supabase
        .from('applications')
        .update({ match_score: bestByJob.get(jobId)! })
        .eq('user_id', userId)
        .eq('id', appIdByJob.get(jobId)!)
      continue
    }
    const { data: inserted, error: insErr } = await supabase
      .from('applications')
      .insert({ user_id: userId, job_id: jobId, stage: 'discovery', match_score: bestByJob.get(jobId)! })
      .select('id')
      .single()

    if (insErr) {
      if (insErr.code === '23505') {
        const { data: ex } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', userId)
          .eq('job_id', jobId)
          .maybeSingle()
        if (ex) appIdByJob.set(jobId, (ex as { id: string }).id)
        continue
      }
      throw new Error(`Graduation insert failed: ${insErr.message}`)
    }

    created += 1
    appIdByJob.set(jobId, (inserted as { id: string }).id)
  }

  // 2. Mode-based enqueue for matches at/above the threshold (assist/auto only).
  let enqueued = 0
  const threshold = await fetchSubmitThreshold(userId)
  for (const [jobId, score] of bestByJob) {
    // Mode-specific floors (BR-130): Auto auto-submits everything that graduated
    // into the pipeline (>= READY_QUEUE_MIN_SCORE); Hybrid only high-fit roles
    // (>= the user's auto_submit_score_threshold). Mirrors claim_submission.
    const decision = decideQueueAction({ reviewMode, matchScore: score, threshold, autoThreshold: READY_QUEUE_MIN_SCORE })
    if (!decision.shouldEnqueue) continue
    const applicationId = appIdByJob.get(jobId)
    if (!applicationId) continue
    try {
      await enqueueForSubmission({
        userId,
        applicationId,
        status: decision.status,
        queuedBy: decision.queuedBy,
      })
      enqueued += 1
    } catch {
      // Best-effort: one enqueue failure must not abort the rest.
    }
  }

  return { created, enqueued }
}

interface GateJobRow {
  id: string
  title: string | null
  location: string | null
  description: string | null
  remote_type: string | null
}

/**
 * Mutates `bestByJob` in place, removing postings the candidate is ineligible
 * for so they never graduate into the Ready-to-Apply queue:
 *   - `block`    — the posting explicitly excludes the candidate (hard gate).
 *   - `penalize` — a geographic mismatch that drops the effective score below
 *                  the ready floor (READY_QUEUE_MIN_SCORE).
 * Gating only applies when the candidate is confidently US-authorized; an
 * unknown/empty profile leaves every match untouched (never over-gates).
 */
async function applyEligibilityGate(
  supabase: NonNullable<ReturnType<typeof getSupabaseClientSafe>>,
  userId: string,
  bestByJob: Map<string, number>,
): Promise<void> {
  try {
    const { data: profileRow } = await supabase
      .from('candidate_profiles')
      .select('location, work_authorization')
      .eq('user_id', userId)
      .maybeSingle()
    const profile = deriveEligibilityProfile(profileRow as CandidateProfileEligibilityRow | null)
    if (!profile.usAuthorized) return

    const { data: jobRows, error } = await supabase
      .from('jobs')
      .select('id, title, location, description, remote_type')
      .eq('user_id', userId)
      .in('id', [...bestByJob.keys()])
    if (error || !jobRows) return

    for (const row of jobRows as GateJobRow[]) {
      const score = bestByJob.get(row.id)
      if (score == null) continue
      const assessment = assessEligibility(
        { title: row.title, location: row.location, description: row.description, remoteType: row.remote_type },
        profile,
      )
      if (assessment.severity === 'block' || effectiveScore(score, assessment) < READY_QUEUE_MIN_SCORE) {
        bestByJob.delete(row.id)
      }
    }
  } catch {
    // Fail-open: an eligibility-gate error must never block legitimate graduation.
  }
}
