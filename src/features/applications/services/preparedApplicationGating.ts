// BKT AI-Apply — prepared-application gating constants + canonical vocab.
//
// Sibling pure-helpers module for preparedApplicationService.ts (no React, no
// component exports). Encodes the ADR-013 mode-gating policy thresholds and the
// anti-bot tier map so the client can render an OPTIONAL pre-flight hint before
// it kicks off on-demand prep. The AUTHORITATIVE gating decision is always made
// server-side in the `prepare-application` Edge Function (and the BR-156 DB
// trigger forces review_gate on sensitive fields regardless of the client); the
// constants here exist only for display/affordance, never to authorize a write.
//
// Threshold drift (LSN-001 / BR-008): the score floors live here as named
// constants citing ADR-013, never as bare literals embedded in JSX/logic, so a
// future change touches one place and every reader cites the rule ID.

import type { Tables } from '@/types/db.types'

/* ───────────────────────── ATS family + anti-bot tier ───────────────────── */

/** ATS families the prep pipeline understands (mirrors the DB CHECK set). */
export const ATS_FAMILIES = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workday',
  'other',
] as const

export type AtsFamily = (typeof ATS_FAMILIES)[number]

export type AntibotTier = 'low' | 'medium' | 'high' | 'unknown'

/** ADR-013 Decision 3 — anti-bot tier is a first-class adapter output, gated by
 *  the resolved TIER (not a hard-coded platform check). Low-tier families expose
 *  auth-free read APIs and host their own apply form. */
const ANTIBOT_TIER_BY_FAMILY: Record<AtsFamily, AntibotTier> = {
  greenhouse: 'low',
  lever: 'low',
  ashby: 'low',
  smartrecruiters: 'low',
  workday: 'high',
  other: 'unknown',
}

/** The low-anti-bot families that are read-API surfaces (Auto-eligible input). */
export const LOW_TIER_FAMILIES: ReadonlySet<AtsFamily> = new Set([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
])

/** Resolves the anti-bot tier for an ATS family, defaulting unknown families to
 *  'unknown' so an unrecognized value never reads as low-risk. */
export function antibotTierFor(family: string): AntibotTier {
  return ANTIBOT_TIER_BY_FAMILY[family as AtsFamily] ?? 'unknown'
}

/* ─────────────────────────── Mode-gating thresholds ─────────────────────── */

/** ADR-013 Decision 4 — Auto-mode unattended prep requires match_score >= 75.
 *  This is the prep score FLOOR for auto-eligibility; it is distinct from the
 *  BR-008/BR-021 auto-SUBMIT threshold (80) which governs submission, not prep. */
export const AUTO_PREP_SCORE_FLOOR = 75

/** ADR-013 Decision 4 — Hybrid on-demand auto-kick-off requires match_score > 80.
 *  An explicit user-initiated prep (prepared_by = 'on_demand') bypasses this gate
 *  but still review-gates every sensitive field individually (BR-156). */
export const HYBRID_PREP_SCORE_FLOOR = 80

/* ─────────────────────────── Status view-model ──────────────────────────── */

export type PreparedStatus = Tables<'prepared_applications'>['status']

/** The DB CHECK set for prepared_applications.status (kept as a typed list for
 *  the review surface to map to a badge tone; the DB remains authoritative). */
export const PREPARED_STATUSES = [
  'prepared',
  'needs_review',
  'ready_to_fill',
  'submitted',
  'stale',
  'blocked',
] as const

/** True when the status means the human must intervene before the macro fills.
 *  Used by the review surface to surface a prominent banner. */
export function statusNeedsAttention(status: string): boolean {
  return status === 'needs_review' || status === 'blocked' || status === 'stale'
}
