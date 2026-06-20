/**
 * mapFields — pure mapping of CandidateData onto a NormalizedSchema's fields,
 * producing MappedField[] (1:1 with prepared_application_fields columns).
 *
 * For each field we resolve a value by canonical key:
 *   • 'profile' (confidence 1)   — a direct candidate scalar (email, phone, …).
 *   • 'derived' (confidence 0.6) — first/last split from fullName when no
 *                                  explicit first/last is stored.
 *   • 'default' (confidence 0)   — no value (file fields, or nothing on file).
 *   • 'ai_draft'                 — RESERVED for free-text drafts (Phase 5); never
 *                                  produced here.
 *
 * review_gate = isSensitive OR (required AND no confident value). The DB trigger
 * (BR-156) additionally forces review_gate=true for every sensitive field, so
 * this is belt-and-suspenders. EEO/answers carry values for AUTOFILL only and are
 * never sent to an LLM (that boundary lives in the edge function / draft layer).
 *
 * File fields (resume / cover_letter) → mappedValue null, value_source 'default',
 * with a note they are manual (the human attaches the file; BR-151).
 *
 * Pure + side-effect free (no I/O, no Deno.*), so it is unit-testable.
 */

import type { CandidateData, MappedField, NormalizedField, NormalizedSchema, ValueSource } from './types.ts'

const FILE_FIELD_KEYS = new Set<string>(['resume', 'cover_letter'])

interface Resolved {
  value: unknown
  source: ValueSource
  confidence: number
}

/** Splits a full name into first / last (last = remainder). */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/** True when a resolved value is meaningfully present. */
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Resolves a single canonical key against candidate data. EEO/answer keys read
 * from the eeo / answers records (autofill-only). Returns a 'default'/0 result
 * when nothing is on file.
 */
function resolveValue(key: string, c: CandidateData): Resolved {
  const profile = (value: unknown): Resolved => ({ value, source: 'profile', confidence: 1 })
  const none = (): Resolved => ({ value: null, source: 'default', confidence: 0 })

  switch (key) {
    case 'full_name': {
      if (hasValue(c.fullName)) return profile(c.fullName)
      const joined = [c.firstName, c.lastName].filter(Boolean).join(' ')
      return hasValue(joined) ? { value: joined, source: 'derived', confidence: 0.6 } : none()
    }
    case 'first_name': {
      if (hasValue(c.firstName)) return profile(c.firstName)
      if (hasValue(c.fullName)) {
        const { first } = splitName(c.fullName as string)
        return hasValue(first) ? { value: first, source: 'derived', confidence: 0.6 } : none()
      }
      return none()
    }
    case 'last_name': {
      if (hasValue(c.lastName)) return profile(c.lastName)
      if (hasValue(c.fullName)) {
        const { last } = splitName(c.fullName as string)
        return hasValue(last) ? { value: last, source: 'derived', confidence: 0.6 } : none()
      }
      return none()
    }
    case 'preferred_name':
      return hasValue(c.preferredName) ? profile(c.preferredName) : none()
    case 'email':
      return hasValue(c.email) ? profile(c.email) : none()
    case 'phone':
      return hasValue(c.phone) ? profile(c.phone) : none()
    case 'phone_country':
      return hasValue(c.phoneCountry) ? profile(c.phoneCountry) : none()
    case 'linkedin':
      return hasValue(c.linkedin) ? profile(c.linkedin) : none()
    case 'website':
      return hasValue(c.website) ? profile(c.website) : none()
    case 'location':
      return hasValue(c.location) ? profile(c.location) : none()
    case 'state':
      return hasValue(c.state) ? profile(c.state) : none()
    case 'work_auth':
      return hasValue(c.workAuthorization) ? profile(c.workAuthorization) : none()
    case 'requires_sponsorship':
      return typeof c.requiresSponsorship === 'boolean'
        ? profile(c.requiresSponsorship ? 'Yes' : 'No')
        : none()
    case 'security_clearance':
      return hasValue(c.securityClearance) ? profile(c.securityClearance) : none()
    case 'employment_history':
      return hasValue(c.employmentHistory)
        ? { value: c.employmentHistory, source: 'profile', confidence: 1 }
        : none()
    default: {
      // EEO disclosures (eeo_*) and custom screeners (answer:<…>) — autofill only.
      if (key.startsWith('eeo_')) {
        const v = c.eeo?.[key]
        return hasValue(v) ? profile(v) : none()
      }
      if (key.startsWith('answer:')) {
        const qKey = key.slice('answer:'.length)
        const v = c.answers?.[qKey]
        return hasValue(v) ? profile(v) : none()
      }
      return none()
    }
  }
}

/** Maps one normalized field onto candidate data. */
function mapOne(field: NormalizedField, candidate: CandidateData): MappedField {
  const isFile = FILE_FIELD_KEYS.has(field.key) || field.type === 'file'

  if (isFile) {
    // Files are attached by the human (BR-151) — never auto-filled with a value.
    return {
      fieldKey: field.key,
      fieldLabel: field.label,
      fieldType: field.type || 'file',
      mappedValue: null,
      valueSource: 'default',
      confidence: 0,
      isSensitive: field.sensitive,
      reviewGate: field.sensitive || field.required,
      freeTextDraft: null,
      redactionSafe: true,
    }
  }

  const resolved = resolveValue(field.key, candidate)
  const confident = resolved.confidence > 0 && hasValue(resolved.value)
  const reviewGate = field.sensitive || (field.required && !confident)

  return {
    fieldKey: field.key,
    fieldLabel: field.label,
    fieldType: field.type || 'text',
    mappedValue: resolved.value,
    valueSource: resolved.source,
    confidence: resolved.confidence,
    isSensitive: field.sensitive,
    reviewGate,
    freeTextDraft: null,
    // Sensitive values are never surfaced unredacted to non-review UI.
    redactionSafe: !field.sensitive,
  }
}

/** Maps every field in a schema onto candidate data. */
export function mapFields(schema: NormalizedSchema, candidate: CandidateData): MappedField[] {
  return schema.fields.map((f) => mapOne(f, candidate))
}
