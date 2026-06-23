// BKT AI-Apply — hard eligibility / location filter (dashboard-uat-audit §6 #2).
//
// Match scoring rewards skill overlap but ignores hard constraints, so postings
// that explicitly exclude US-based candidates (or are based in a foreign country
// with no US-remote option) were scoring high and reaching the Ready-to-Apply
// queue. This pure module assesses a posting against the candidate's eligibility
// context so the graduation gate can BLOCK or heavily PENALIZE those before they
// surface for auto-apply. Pure + deterministic (unit-tested) — no IO here; the
// caller supplies the candidate context derived from candidate_profiles.

export interface EligibilityProfile {
  /** True when the candidate is authorized to work in the US (and US-based). */
  usAuthorized: boolean
  /** Lowercased free-text location of the candidate (candidate_profiles.location). */
  location: string
}

export interface EligibilityJob {
  title: string | null
  location: string | null
  description: string | null
  /** jobs.remote_type when known ('remote' | 'hybrid' | 'on-site' | …). */
  remoteType?: string | null
}

export type EligibilitySeverity = 'ok' | 'penalize' | 'block'

export interface EligibilityAssessment {
  severity: EligibilitySeverity
  /** Points to subtract from the match score (only when severity === 'penalize'). */
  penalty: number
  reasons: string[]
}

/** Penalty applied to a geographically-mismatched (but not explicitly excluded)
 *  role — enough to drop a typical 70–80 match below the 60 ready-queue floor. */
export const GEO_MISMATCH_PENALTY = 45

/** Phrases that explicitly exclude US-based candidates (the Swans-style wall). */
const US_EXCLUSION_RE: RegExp[] = [
  /not\s+considering\s+candidates?[^.]{0,30}\bin\s+the\s+(u\.?\s?s\.?(a\.?)?|united\s+states)\b/i,
  /not\s+(currently\s+)?(accepting|hiring)\s+(candidates|applicants)[^.]{0,30}\b(in|from)\s+the\s+(u\.?\s?s\.?|united\s+states)\b/i,
  /must\s+(be\s+)?(located|based|reside)[^.]{0,30}\boutside\s+(the\s+)?(u\.?\s?s\.?|united\s+states)\b/i,
  /\b(u\.?\s?s\.?|united\s+states)[- ]based\s+(candidates|applicants)\s+(will\s+not|cannot|are\s+not)\b/i,
]

/** Foreign-country tokens that, as the job's location with no US-remote signal,
 *  make a US-only candidate a poor/ineligible fit (conservative list). */
const FOREIGN_COUNTRY_RE =
  /\b(india|brazil|pakistan|philippines|nigeria|kenya|ukraine|poland|germany|france|spain|portugal|netherlands|ireland|united\s+kingdom|u\.?k\.?|england|mexico|argentina|colombia|egypt|bangladesh|vietnam|indonesia|romania|singapore|australia|japan|china)\b/i

/** True when text signals US work eligibility (location or remote-US wording). */
function signalsUs(text: string): boolean {
  return (
    /\b(united\s+states|u\.?\s?s\.?a\.?|u\.?\s?s\.?|usa)\b/i.test(text) ||
    /\bremote\b[^.]{0,25}\b(us|u\.?s\.?|united\s+states|usa)\b/i.test(text) ||
    /\banywhere\s+in\s+(the\s+)?(us|united\s+states)\b/i.test(text)
  )
}

/**
 * Assess a posting against the candidate's eligibility context.
 *
 * - `block`     — the posting explicitly excludes the candidate (hard gate).
 * - `penalize`  — geographic mismatch (foreign-located, no US-remote) → subtract
 *                 GEO_MISMATCH_PENALTY from the score before the ready-queue floor.
 * - `ok`        — no hard conflict detected.
 *
 * Only US-authorized candidates are gated here (the data we have); a non-US
 * candidate is never penalized for a foreign role.
 */
export function assessEligibility(job: EligibilityJob, profile: EligibilityProfile): EligibilityAssessment {
  if (!profile.usAuthorized) return { severity: 'ok', penalty: 0, reasons: [] }

  const haystack = `${job.title ?? ''}\n${job.location ?? ''}\n${job.description ?? ''}`
  const loc = `${job.location ?? ''} ${job.remoteType ?? ''}`

  // 1) Explicit exclusion of US-based candidates → hard block.
  if (US_EXCLUSION_RE.some((re) => re.test(haystack))) {
    return { severity: 'block', penalty: 0, reasons: ['Posting explicitly excludes US-based candidates'] }
  }

  // 2) Foreign-located role with no US-remote signal (in location OR body) → penalize.
  const foreign = loc.match(FOREIGN_COUNTRY_RE)
  if (foreign && !signalsUs(loc) && !signalsUs(haystack)) {
    return {
      severity: 'penalize',
      penalty: GEO_MISMATCH_PENALTY,
      reasons: [`Role is based in ${foreign[0]} with no US-remote option`],
    }
  }

  return { severity: 'ok', penalty: 0, reasons: [] }
}

/** Effective ready-queue score for a posting: the match score minus any
 *  eligibility penalty, floored at 0. A `block` collapses the score to 0. */
export function effectiveScore(score: number, assessment: EligibilityAssessment): number {
  if (assessment.severity === 'block') return 0
  return Math.max(0, score - assessment.penalty)
}

export interface CandidateProfileEligibilityRow {
  location: string | null
  work_authorization: string | null
}

/** Derive the eligibility context from a candidate_profiles row. US-authorized
 *  when the work-authorization names citizenship / permanent residence, or the
 *  location clearly resolves to the US. Defaults to NOT US-authorized (so an
 *  empty/unknown profile never over-gates foreign roles). */
export function deriveEligibilityProfile(row: CandidateProfileEligibilityRow | null | undefined): EligibilityProfile {
  const location = (row?.location ?? '').toLowerCase()
  const auth = (row?.work_authorization ?? '').toLowerCase()
  const usAuthorized =
    /citizen|permanent\s+resident|green\s+card|authorized\s+to\s+work\s+in\s+the\s+(us|united\s+states)/i.test(auth) ||
    /\b(united\s+states|u\.?\s?s\.?a\.?|usa)\b/i.test(location) ||
    /,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i.test(location)
  return { usAuthorized, location }
}
