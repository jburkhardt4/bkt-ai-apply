import type { FieldConfig } from '../types'

/**
 * Default visible-label synonyms per canonical field key, for the B5 label-text
 * fallback matcher (ADR-014 D4). They are the durable locator when an ATS keys
 * its fields by opaque ids — e.g. Greenhouse's job-boards template renders every
 * field as `#question_<id>`, so semantic selectors (`#first_name`,
 * `input[name*="linkedin"]`) miss and only the visible `<label>` text identifies
 * the field. Lowercase; the matcher compares them as normalized substrings and
 * commits only on an unambiguous match (autofill.ts).
 *
 * Shared across boards via {@link applySignals}; a board may override per field by
 * setting `labels` explicitly on its FieldConfig.
 */
export const DEFAULT_FIELD_LABELS: Record<string, string[]> = {
  first_name: ['first name', 'given name', 'legal first name'],
  last_name: ['last name', 'family name', 'surname', 'legal last name'],
  preferred_name: ['preferred name', 'preferred first name', 'nickname'],
  email: ['email', 'e-mail'],
  phone: ['phone', 'mobile', 'telephone'],
  linkedin: ['linkedin'],
  website: ['website', 'portfolio', 'personal site', 'personal website'],
  location: ['location', 'current city'],
  state: ['state', 'which state', 'state you', 'reside', 'province'],
  country: ['country'],
}

/**
 * Canonical keys that are sensitive — EEO, work authorization, sponsorship,
 * legal/clearance/salary. The label matcher NEVER auto-locates these (BR-156 +
 * reviewRules.neverAutoSubmit); they stay human/review. A board's direct,
 * explicit selector still applies where one is provided (the legacy contract is
 * unchanged) — this set only governs the new fuzzy label fallback.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'work_auth',
  'requires_sponsorship',
  'requires_sponsorship_future',
  'security_clearance',
  'desired_salary',
  'eeo_gender',
  'eeo_race',
  'eeo_hispanic_latino',
  'eeo_veteran',
  'eeo_disability',
])

/**
 * Enriches a board's field list with default label synonyms + the sensitive flag
 * so the injected macro (which can't import this module — it is serialized whole
 * into the page) carries them on the config object it receives. A field's own
 * explicit `labels` / `sensitive` always win. `answer:*` screeners get no default
 * labels (their phrasing is question-specific — seeded later via the Answer
 * Library, Part B4).
 */
export function applySignals(fields: FieldConfig[]): FieldConfig[] {
  return fields.map((f) => ({
    ...f,
    labels: f.labels ?? (f.key.startsWith('answer:') ? undefined : DEFAULT_FIELD_LABELS[f.key]),
    sensitive: f.sensitive ?? SENSITIVE_KEYS.has(f.key),
  }))
}
