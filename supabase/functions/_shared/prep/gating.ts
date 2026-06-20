/**
 * decidePrep — pure implementation of the MODE-GATING POLICY (shared contract).
 *
 * Auto-mode UNATTENDED prep is allowed ONLY when ALL hold:
 *   (1) ats_family in the LOW anti-bot tier {greenhouse, lever, ashby, smartrecruiters};
 *   (2) schema contains NO sensitive/legal gating fields;
 *   (3) match_score >= 75;
 *   (4) source is a read-API surface (NOT linkedin/indeed/glassdoor/workday) —
 *       enforced upstream by buildReadEndpoint (workday/other have no read API)
 *       and re-asserted here via family + tier.
 * Any failure → 'needs_review' with a gating_reason (or 'blocked' for a defended
 * platform under auto mode). Workday/LinkedIn/Indeed are NEVER Auto-eligible.
 *
 * On-demand prep (prepared_by='on_demand', user-initiated) BYPASSES the score
 * gate but still review-gates every sensitive field individually (which the DB
 * trigger BR-156 already enforces). It is never 'blocked' — a user explicitly
 * asked for it — but a defended/unreadable family yields 'needs_review' since the
 * schema could not be auto-read.
 *
 * Pure + side-effect free (no I/O, no Deno.*), so it is unit-testable.
 */

import type {
  AntibotTier,
  AtsFamily,
  MappedField,
  PrepDecision,
  PrepMode,
  PreparedBy,
} from './types.ts'

const AUTO_SCORE_FLOOR = 75

const LOW_TIER_FAMILIES: ReadonlySet<AtsFamily> = new Set<AtsFamily>([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
])

export interface PrepDecisionInput {
  atsFamily: AtsFamily
  antibotTier: AntibotTier
  mode: PrepMode
  matchScore: number | null
  fields: MappedField[]
  preparedBy: PreparedBy
}

/** Returns true when the schema contains any sensitive field. */
function hasSensitiveField(fields: MappedField[]): boolean {
  return fields.some((f) => f.isSensitive)
}

/**
 * Decides the prepared_applications.status + gating_reason.
 *
 * Precedence (first match wins):
 *   1. auto + defended family (workday/other / non-low tier) → 'blocked'
 *   2. any sensitive field present                           → 'needs_review'
 *   3. auto + match_score below floor (or unknown)           → 'needs_review'
 *   4. on-demand + no readable schema family                 → 'needs_review'
 *   5. otherwise                                             → 'prepared'
 */
export function decidePrep(input: PrepDecisionInput): PrepDecision {
  const { atsFamily, antibotTier, mode, matchScore, fields, preparedBy } = input
  const isAuto = mode === 'auto'
  const isLowTierFamily = LOW_TIER_FAMILIES.has(atsFamily) && antibotTier === 'low'

  // 1) Auto mode never touches a defended platform (workday/other, high/unknown).
  if (isAuto && !isLowTierFamily) {
    return { status: 'blocked', gatingReason: 'auto_mode_defended_platform' }
  }

  // 2) Any sensitive/legal field present → human review (regardless of mode).
  if (hasSensitiveField(fields)) {
    return { status: 'needs_review', gatingReason: 'sensitive_fields_present' }
  }

  // 3) Auto mode requires a confident match. On-demand bypasses the score gate.
  if (isAuto && preparedBy !== 'on_demand') {
    if (matchScore === null || matchScore < AUTO_SCORE_FLOOR) {
      return { status: 'needs_review', gatingReason: 'match_score_below_auto_floor' }
    }
  }

  // 4) On-demand on a family we cannot auto-read → review (schema is unverified).
  if (preparedBy === 'on_demand' && !isLowTierFamily) {
    return { status: 'needs_review', gatingReason: 'unreadable_ats_family' }
  }

  // 5) Clean — eligible for unattended prep.
  return { status: 'prepared', gatingReason: null }
}
