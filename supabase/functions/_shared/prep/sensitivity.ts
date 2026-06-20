/**
 * isSensitiveField — pure classifier for the contract's SENSITIVE list.
 *
 * Sensitive fields are ALWAYS review-gated at the DB level (BR-156 trigger +
 * CHECK). This module is the prep layer's matching half: it flags a field as
 * sensitive by canonical key AND by a defensive label scan (so a custom
 * 'answer:<…>' screener that asks for salary/sponsorship/legal attestation is
 * still caught even though its key is not in the fixed vocabulary).
 *
 * SENSITIVE per the contract:
 *   work_auth, requires_sponsorship, all eeo_*, security_clearance, any
 *   salary/compensation question, any legal attestation.
 *
 * Pure + side-effect free (no I/O, no Deno.*), so it is unit-testable.
 */

/** Canonical keys that are unconditionally sensitive. */
const SENSITIVE_KEYS = new Set<string>([
  'work_auth',
  'requires_sponsorship',
  'security_clearance',
  'eeo_gender',
  'eeo_race',
  'eeo_hispanic_latino',
  'eeo_veteran',
  'eeo_disability',
])

/**
 * Label substrings that mark a field sensitive regardless of its key. Lower-cased
 * comparison. Covers salary/compensation, sponsorship/work-authorization phrasing,
 * security clearance, demographic prompts, and legal attestations that arrive as
 * free-form custom screeners ('answer:<…>').
 */
const SENSITIVE_LABEL_PATTERNS: string[] = [
  // compensation / salary
  'salary',
  'compensation',
  'pay expectation',
  'expected pay',
  'desired pay',
  'rate expectation',
  // work authorization / sponsorship
  'sponsor',
  'work authorization',
  'authorized to work',
  'right to work',
  'visa',
  'immigration',
  // clearance
  'security clearance',
  'clearance',
  // demographic / EEO
  'gender',
  'race',
  'ethnicity',
  'hispanic',
  'latino',
  'veteran',
  'disability',
  'sexual orientation',
  // legal attestations
  'certify',
  'attest',
  'i agree',
  'consent',
  'background check',
  'criminal',
  'felony',
  'conviction',
]

/**
 * Returns true when a field is sensitive by its canonical key or by a defensive
 * scan of its label. EEO keys (any 'eeo_' prefix) are always sensitive.
 */
export function isSensitiveField(key: string, label: string): boolean {
  const k = key.trim().toLowerCase()
  if (SENSITIVE_KEYS.has(k)) return true
  if (k.startsWith('eeo_')) return true

  const l = label.trim().toLowerCase()
  if (!l) return false
  return SENSITIVE_LABEL_PATTERNS.some((p) => l.includes(p))
}
