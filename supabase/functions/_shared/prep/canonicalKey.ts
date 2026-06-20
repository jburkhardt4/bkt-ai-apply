/**
 * toCanonicalKey — pure mapping of an ATS field's (label, name) to the canonical
 * field_key vocabulary the extension consumes verbatim (extension/src/payload.ts
 * buildPayload). Unknown custom questions map to 'answer:<slugified-key>' so they
 * round-trip into the application_answers library without losing identity.
 *
 * Pure + side-effect free (no I/O, no Deno.*), so it is unit-testable.
 *
 * Resolution order: try the field `name` (machine identifier, most reliable),
 * then the human `label`. The first canonical match wins; otherwise we slugify
 * and emit 'answer:<slug>'.
 */

/**
 * Direct token → canonical key. Tokens are lower-cased, non-alphanumeric runs
 * collapsed to a single space, trimmed; compared against normalized name/label.
 */
const EXACT_TOKEN_MAP: Record<string, string> = {
  // names / identity
  'first name': 'first_name',
  firstname: 'first_name',
  'given name': 'first_name',
  'last name': 'last_name',
  lastname: 'last_name',
  surname: 'last_name',
  'family name': 'last_name',
  'full name': 'full_name',
  fullname: 'full_name',
  name: 'full_name',
  'preferred name': 'preferred_name',
  'preferred first name': 'preferred_name',
  nickname: 'preferred_name',
  // contact
  email: 'email',
  'email address': 'email',
  'e mail': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  telephone: 'phone',
  'phone country': 'phone_country',
  'country code': 'phone_country',
  // links
  linkedin: 'linkedin',
  'linkedin profile': 'linkedin',
  'linkedin url': 'linkedin',
  website: 'website',
  'personal website': 'website',
  portfolio: 'website',
  'portfolio url': 'website',
  // location
  location: 'location',
  'current location': 'location',
  city: 'location',
  'city state': 'location',
  state: 'state',
  province: 'state',
  region: 'state',
  // work auth (sensitive)
  'work authorization': 'work_auth',
  'are you authorized to work': 'work_auth',
  'work authorisation': 'work_auth',
  'employment authorization': 'work_auth',
  'require sponsorship': 'requires_sponsorship',
  'will you require sponsorship': 'requires_sponsorship',
  'do you require sponsorship': 'requires_sponsorship',
  'visa sponsorship': 'requires_sponsorship',
  'require visa sponsorship': 'requires_sponsorship',
  'security clearance': 'security_clearance',
  clearance: 'security_clearance',
  // documents
  resume: 'resume',
  'resume cv': 'resume',
  cv: 'resume',
  'resume curriculum vitae': 'resume',
  'cover letter': 'cover_letter',
  coverletter: 'cover_letter',
  // EEO (sensitive)
  gender: 'eeo_gender',
  'gender identity': 'eeo_gender',
  race: 'eeo_race',
  'race ethnicity': 'eeo_race',
  ethnicity: 'eeo_race',
  'hispanic or latino': 'eeo_hispanic_latino',
  'hispanic latino': 'eeo_hispanic_latino',
  'are you hispanic or latino': 'eeo_hispanic_latino',
  'veteran status': 'eeo_veteran',
  veteran: 'eeo_veteran',
  'protected veteran': 'eeo_veteran',
  'disability status': 'eeo_disability',
  disability: 'eeo_disability',
  // employment history block
  'employment history': 'employment_history',
  'work history': 'employment_history',
  'work experience': 'employment_history',
}

/**
 * Phrase → canonical key, matched as a SUBSTRING of a normalized label/name.
 * Ordered most-specific first (longer phrases before the bare token they
 * contain) so e.g. "visa sponsorship" wins over a generic "visa". Used as a
 * second pass after exact-token lookup, for real ATS question phrasings like
 * "Are you legally authorized to work in the US?".
 */
const SUBSTRING_PHRASE_MAP: Array<[string, string]> = [
  // sponsorship before work-auth (a sponsorship question may also say "work")
  ['require sponsorship', 'requires_sponsorship'],
  ['require visa sponsorship', 'requires_sponsorship'],
  ['visa sponsorship', 'requires_sponsorship'],
  ['need sponsorship', 'requires_sponsorship'],
  ['sponsorship', 'requires_sponsorship'],
  ['authorized to work', 'work_auth'],
  ['authorised to work', 'work_auth'],
  ['work authorization', 'work_auth'],
  ['work authorisation', 'work_auth'],
  ['right to work', 'work_auth'],
  ['security clearance', 'security_clearance'],
  ['hispanic or latino', 'eeo_hispanic_latino'],
  ['hispanic', 'eeo_hispanic_latino'],
  ['veteran', 'eeo_veteran'],
  ['disability', 'eeo_disability'],
  ['race or ethnicity', 'eeo_race'],
  ['race ethnicity', 'eeo_race'],
  ['ethnicity', 'eeo_race'],
  ['gender identity', 'eeo_gender'],
  ['gender', 'eeo_gender'],
  ['preferred name', 'preferred_name'],
  ['first name', 'first_name'],
  ['last name', 'last_name'],
  ['full name', 'full_name'],
  ['email address', 'email'],
  ['phone number', 'phone'],
  ['linkedin', 'linkedin'],
  ['portfolio', 'website'],
  ['personal website', 'website'],
  ['cover letter', 'cover_letter'],
  ['resume', 'resume'],
  ['curriculum vitae', 'resume'],
]

/** Normalizes a raw label/name to lower-case alphanumeric-separated tokens. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Slugifies a raw string to a stable underscore key for 'answer:<slug>'. */
function slugify(raw: string): string {
  return normalize(raw).replace(/\s+/g, '_')
}

/**
 * Maps (label, name) → canonical key, or 'answer:<slug>' for an unknown custom
 * question, or null only when BOTH inputs are empty (nothing to key on).
 *
 * Resolution:
 *   1. exact-token map on name then label (most reliable);
 *   2. substring-phrase map on label then name (real question phrasings);
 *   3. fall back to answer:<slug> — preferring the LABEL slug when the name is
 *      an opaque ATS id (question_123), else the name slug.
 */
export function toCanonicalKey(label: string, name: string): string | null {
  const normName = normalize(name ?? '')
  const normLabel = normalize(label ?? '')

  // 1) Exact token match (name first — machine identifier is most reliable).
  for (const norm of [normName, normLabel]) {
    if (!norm) continue
    const mapped = EXACT_TOKEN_MAP[norm]
    if (mapped) return mapped
  }

  // 2) Substring-phrase match (label first — labels carry the human phrasing).
  for (const norm of [normLabel, normName]) {
    if (!norm) continue
    for (const [phrase, key] of SUBSTRING_PHRASE_MAP) {
      if (norm.includes(phrase)) return key
    }
  }

  // 3) answer:<slug>. The human question LABEL is the stable identity a user
  // answers, so prefer it; fall back to the machine name only when no label.
  for (const c of [label, name]) {
    const slug = slugify(c ?? '')
    if (slug) return `answer:${slug}`
  }

  return null
}
