// BKT Apply-Macro — prepared-application → autofill payload (pure module).
//
// Converts server-prepared `prepared_application_fields` rows into the flat
// AutofillPayload the existing autofill macro consumes verbatim (the field_key
// vocabulary is shared on purpose — see extension/src/payload.ts buildPayload).
//
// Chrome-free + DOM-free by design (references only its argument), so it is
// vitest-safe AND can run inside the MV3 content/background contexts unchanged.
//
// HARD RULE: any review-gated field is EXCLUDED from the auto-fill payload and
// returned in `gated` for the human to handle. Sensitive fields (work_auth,
// requires_sponsorship, all eeo_*, security_clearance, salary/compensation,
// legal attestations) are review-gated at the DB level (BR-156: a trigger forces
// review_gate=true whenever is_sensitive=true, plus a CHECK constraint). We treat
// BOTH review_gate AND is_sensitive as gates here — belt-and-suspenders — so the
// macro can never auto-fill a sensitive field even if a row somehow arrived
// without the gate set. EEO/demographic + answers are never sent to the LLM.

import type { AutofillPayload } from './types'

/** The subset of a `prepared_application_fields` row this module needs. Mirrors
 *  the DB shape (src/types/db.types.ts) but kept local so this module stays
 *  dependency-free and importable from any context. */
export interface PreparedFieldRow {
  field_key: string
  /** jsonb — may arrive as string | number | boolean | null (or absent). */
  mapped_value?: unknown
  /** AI-drafted free text (e.g. a screener answer) when there is no mapped value. */
  free_text_draft?: string | null
  /** True → the human must review/fill this field; NEVER auto-filled. */
  review_gate?: boolean | null
  /** True → demographic / legal / compensation; always review-gated (BR-156). */
  is_sensitive?: boolean | null
}

/** Result of converting prepared fields: the auto-fillable payload + the list of
 *  field_keys held back for human review. */
export interface PreparedFillResult {
  payload: AutofillPayload
  gated: string[]
}

/** Coerces a jsonb mapped_value into the flat string the autofill macro fills.
 *  Returns null when there is no usable scalar value (objects/arrays/null are
 *  left to the human — the macro never fabricates a value, UAT-4). */
function coerceScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  // null / undefined / objects (e.g. employment_history blocks) → not auto-filled.
  return null
}

/**
 * Builds the flat autofill payload from prepared fields, EXCLUDING any gated or
 * sensitive field (those go into `gated`). A field contributes its `field_key`
 * verbatim so the existing board configs map it exactly as they do for the
 * profile-built payload. Order is preserved and the last non-gated value for a
 * given key wins (rows are unique per (prepared_application_id, field_key), so
 * collisions are not expected — this is purely defensive).
 */
export function preparedToPayload(fields: readonly PreparedFieldRow[]): PreparedFillResult {
  const payload: AutofillPayload = {}
  const gated: string[] = []
  const seenGated = new Set<string>()

  for (const field of fields ?? []) {
    const key = typeof field?.field_key === 'string' ? field.field_key.trim() : ''
    if (!key) continue

    // Gate check first: a gated/sensitive field is NEVER auto-filled, regardless
    // of whether it carries a value. Surface it once for the human.
    if (field.review_gate === true || field.is_sensitive === true) {
      if (!seenGated.has(key)) {
        seenGated.add(key)
        gated.push(key)
      }
      continue
    }

    // Non-gated: prefer the mapped scalar value; fall back to an AI free-text
    // draft (e.g. a non-sensitive screener answer) when there is no mapped value.
    const value =
      coerceScalar(field.mapped_value) ??
      (typeof field.free_text_draft === 'string' && field.free_text_draft.trim()
        ? field.free_text_draft.trim()
        : null)
    if (value === null) continue
    payload[key] = value
  }

  return { payload, gated }
}
