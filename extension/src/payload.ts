import type { AutofillPayload } from './types'

/**
 * Contact + identity fields the macro fills, sourced from `candidate_profiles`
 * over the user's own RLS-scoped Supabase session (no service role — ever).
 *
 * `eeo` and `answers` are demographic + custom-screener responses the user has
 * pre-stored (eeo_disclosures jsonb / the application_answers table). They are
 * filled into the ATS form ONLY (autofill is human-reviewed, BR-151); they are
 * never sent to the LLM — the scoring path carries fit-relevant fields only
 * (ADR-011).
 */
export interface ContactProfile {
  fullName?: string
  firstName?: string
  lastName?: string
  preferredName?: string
  email?: string
  phone?: string
  phoneCountry?: string
  linkedin?: string
  website?: string
  location?: string
  state?: string
  workAuthorization?: string
  /** Tri-state: true → needs sponsorship, false → does not, undefined → unknown. */
  requiresSponsorship?: boolean
  /** EEO/demographic disclosures, normalized keys (gender, race, …). */
  eeo?: Record<string, string>
  /** Custom screener answers keyed by question_key (application_answers). */
  answers?: Record<string, string>
}

/** Splits a full name into first / last (last = the remainder). */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/**
 * Builds the flat autofill payload from the user's contact profile. Provides
 * both split (first/last — Greenhouse) and combined (full_name — Lever/Ashby)
 * name keys so each board's config picks the shape it needs. Only non-empty
 * values are included, so the macro never overwrites a field with a blank — it
 * reports `no_value` instead (spec §4.3).
 *
 * EEO/demographic and custom-screener answers are emitted under stable, prefixed
 * keys (`eeo_*`, `answer:<question_key>`) so a board config can opt into filling
 * them by referencing the same key. A board only fills what its config maps; an
 * unmapped answer stays out of the form (UAT-4 — no fabricated answers).
 */
export function buildPayload(profile: ContactProfile): AutofillPayload {
  const payload: AutofillPayload = {}
  const first = profile.firstName ?? (profile.fullName ? splitName(profile.fullName).first : '')
  const last = profile.lastName ?? (profile.fullName ? splitName(profile.fullName).last : '')
  const full = profile.fullName?.trim() ?? [first, last].filter(Boolean).join(' ')
  if (full) payload['full_name'] = full
  if (first) payload['first_name'] = first
  if (last) payload['last_name'] = last
  if (profile.preferredName) payload['preferred_name'] = profile.preferredName
  if (profile.email) payload['email'] = profile.email
  if (profile.phone) payload['phone'] = profile.phone
  if (profile.phoneCountry) payload['phone_country'] = profile.phoneCountry
  if (profile.linkedin) payload['linkedin'] = profile.linkedin
  if (profile.website) payload['website'] = profile.website
  if (profile.location) payload['location'] = profile.location
  if (profile.state) payload['state'] = profile.state
  if (profile.workAuthorization) payload['work_auth'] = profile.workAuthorization
  // Tri-state: only emit when explicitly known (true/false). undefined → omit so
  // the macro reports no_value rather than guessing the user's sponsorship need.
  if (typeof profile.requiresSponsorship === 'boolean') {
    payload['requires_sponsorship'] = profile.requiresSponsorship ? 'Yes' : 'No'
  }

  // EEO/demographic → stable eeo_* keys (the board config opts in per field).
  const eeo = profile.eeo ?? {}
  const eeoMap: Record<string, string> = {
    gender: 'eeo_gender',
    race_ethnicity: 'eeo_race',
    hispanic_latino: 'eeo_hispanic_latino',
    veteran_status: 'eeo_veteran',
    disability_status: 'eeo_disability',
  }
  for (const [src, dest] of Object.entries(eeoMap)) {
    const v = eeo[src]
    if (typeof v === 'string' && v.trim()) payload[dest] = v
  }

  // Custom screeners → answer:<question_key> (a config maps the exact key).
  for (const [key, value] of Object.entries(profile.answers ?? {})) {
    if (typeof value === 'string' && value.trim()) payload[`answer:${key}`] = value
  }

  return payload
}
