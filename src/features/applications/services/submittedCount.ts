// BKT AI-Apply — submitted-count derivation (Phase 2b: dashboard honesty).
//
// "Submitted" is derived from `applications` DB truth, NOT a localStorage delta.
// An application counts as submitted once it has actually been sent to an
// employer. Three signals, in priority order:
//   1. `submitted_at` is set — an explicit submission stamp, OR
//   2. it currently sits in a post-`discovery` non-terminal stage (applied …
//      hired): the only path into those stages runs through `applied`
//      (see domain/stageRules.ts), so the stage alone proves submission, OR
//   3. it is in a terminal stage (rejected / ghosted) AND the event log shows it
//      was actually submitted. `discovery → rejected`/`ghosted` is a valid
//      transition (a never-submitted dismissal) and the live submission path
//      (`discovery → applied`) does not stamp `submitted_at`, so terminals are
//      ambiguous — we count them only when a `stage_transition` INTO `applied`
//      exists for the application (BR-133: the event log is the source of truth).
import type { PipelineStage } from '../../../types/pipeline'

/** The minimal application shape needed to decide if it was submitted. */
export interface SubmittedCountInput {
  /** Application id — used to resolve ambiguous terminal stages via the event log. */
  id?: string
  stage: PipelineStage | string
  submitted_at: string | null
}

/**
 * Post-`discovery` stages whose presence alone proves submission — the only
 * path into them runs through `applied` (domain/stageRules.ts).
 */
const SUBMITTED_STAGES: ReadonlySet<string> = new Set<string>([
  'applied',
  'screening',
  'interview_scheduled',
  'interview_complete',
  'offer',
  'hired',
])

/**
 * Terminal stages reachable BOTH from a submitted stage (rejected/ghosted after
 * applying) AND directly from `discovery` (a never-submitted dismissal). They
 * count as submitted only when proven via `submitted_at` or the event log.
 */
const AMBIGUOUS_TERMINAL_STAGES: ReadonlySet<string> = new Set<string>(['rejected', 'ghosted'])

/**
 * True when a single application should count as "submitted". `everSubmittedIds`
 * carries the application ids that have a `stage_transition` INTO `applied` in
 * `application_events`; pass it so submitted-then-terminal applications that
 * never received a `submitted_at` stamp are still counted.
 */
export function isSubmittedApplication(
  row: SubmittedCountInput,
  everSubmittedIds?: ReadonlySet<string>,
): boolean {
  if (row.submitted_at != null) {
    return true
  }
  if (SUBMITTED_STAGES.has(row.stage)) {
    return true
  }
  if (
    AMBIGUOUS_TERMINAL_STAGES.has(row.stage) &&
    row.id != null &&
    everSubmittedIds?.has(row.id) === true
  ) {
    return true
  }
  return false
}

/** Counts how many applications in the set have been submitted (DB truth). */
export function deriveSubmittedCount(
  rows: readonly SubmittedCountInput[],
  everSubmittedIds?: ReadonlySet<string>,
): number {
  return rows.reduce(
    (total, row) => (isSubmittedApplication(row, everSubmittedIds) ? total + 1 : total),
    0,
  )
}
