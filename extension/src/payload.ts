import type { AutofillPayload } from './types'

/**
 * Contact + identity fields the macro fills, sourced from `candidate_profiles`
 * over the user's own RLS-scoped Supabase session (no service role — ever).
 */
export interface ContactProfile {
  fullName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  linkedin?: string
  workAuthorization?: string
}

/** Splits a full name into first / last (last = the remainder). */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/**
 * Builds the flat autofill payload from the user's contact profile. Only
 * non-empty values are included, so the macro never overwrites a field with a
 * blank — it reports `no_value` instead (spec §4.3).
 */
export function buildPayload(profile: ContactProfile): AutofillPayload {
  const payload: AutofillPayload = {}
  const first = profile.firstName ?? (profile.fullName ? splitName(profile.fullName).first : '')
  const last = profile.lastName ?? (profile.fullName ? splitName(profile.fullName).last : '')
  if (first) payload['first_name'] = first
  if (last) payload['last_name'] = last
  if (profile.email) payload['email'] = profile.email
  if (profile.phone) payload['phone'] = profile.phone
  if (profile.linkedin) payload['linkedin'] = profile.linkedin
  if (profile.workAuthorization) payload['work_auth'] = profile.workAuthorization
  return payload
}
