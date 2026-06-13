// BKT AI-Apply — submitted-count derivation (Phase 2b: dashboard honesty).
//
// "Submitted" is derived from `applications` DB truth, NOT a localStorage
// delta. An application counts as submitted once it has actually left
// discovery on the happy path (BR-135: discovery → applied only on confirmed
// submission) OR carries a `submitted_at` timestamp. Declined terminals
// (rejected / ghosted) reached directly from discovery without a submission
// are NOT counted as submitted.
//
// Stage order (CLAUDE.md pipeline): discovery → applied → screening →
// interview_scheduled → interview_complete → offer → hired. The branch
// terminals rejected / ghosted are off the submitted happy-path; we only
// count them when a submission actually happened (submitted_at set) so a
// "rejected after applying" still counts, while a "rejected from discovery"
// (e.g. a bad-fit auto-decline) does not inflate the number.
import type { PipelineStage } from '../../../types/pipeline'

/** The minimal application shape needed to decide if it was submitted. */
export interface SubmittedCountInput {
  stage: PipelineStage | string
  submitted_at: string | null
}

/**
 * Stages that, once reached, mean the application was submitted. These are the
 * post-`discovery` happy-path stages (BR-013 valid stages minus discovery and
 * the off-path branch terminals rejected / ghosted, which are handled via
 * `submitted_at`).
 */
const SUBMITTED_STAGES: ReadonlySet<string> = new Set<string>([
  'applied',
  'screening',
  'interview_scheduled',
  'interview_complete',
  'offer',
  'hired',
])

/** True when a single application should count as "submitted". */
export function isSubmittedApplication(row: SubmittedCountInput): boolean {
  if (row.submitted_at != null) {
    return true
  }
  return SUBMITTED_STAGES.has(row.stage)
}

/** Counts how many applications in the set have been submitted (DB truth). */
export function deriveSubmittedCount(rows: readonly SubmittedCountInput[]): number {
  return rows.reduce((total, row) => (isSubmittedApplication(row) ? total + 1 : total), 0)
}
