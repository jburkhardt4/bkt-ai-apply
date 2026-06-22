// BKT AI-Apply — Preferences profile helpers (sibling to PreferencesScreen.tsx
// so the screen file exports only React components, per
// react-refresh/only-export-components; same split pattern as
// reviewModes.ts / auth-context.ts). Pure helpers + constants only — no React.

import type { Json, Tables, TablesInsert } from '@/types/db.types'

/** Splits a full name into first / last (last = the remainder). Empty-safe. */
function splitName(full: string): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/* ───────────────────────── EEO / Demographics ───────────────────────── */

/** Sentinel choice every EEO question offers — never inferred, always opt-in. */
export const EEO_DECLINE = 'Decline to answer'

/** The five EEO/demographics keys persisted in candidate_profiles.eeo_disclosures.
 *  Each value is a free-text/choice answer or EEO_DECLINE. Keys mirror the jsonb
 *  shape documented for the column. */
export const EEO_FIELDS = [
  'gender',
  'race_ethnicity',
  'hispanic_latino',
  'veteran_status',
  'disability_status',
] as const

export type EeoField = (typeof EEO_FIELDS)[number]

export type EeoDisclosures = Partial<Record<EeoField, string>>

export interface EeoQuestion {
  key: EeoField
  label: string
  options: string[]
}

/** Standard US-EEOC-style choice sets; EEO_DECLINE is appended to every one so
 *  the control always offers an explicit opt-out. */
export const EEO_QUESTIONS: EeoQuestion[] = [
  {
    key: 'gender',
    label: 'Gender',
    options: ['Male', 'Female', 'Non-binary', EEO_DECLINE],
  },
  {
    key: 'race_ethnicity',
    label: 'Race / Ethnicity',
    options: [
      'American Indian or Alaska Native',
      'Asian',
      'Black or African American',
      'Native Hawaiian or Other Pacific Islander',
      'White',
      'Two or More Races',
      EEO_DECLINE,
    ],
  },
  {
    key: 'hispanic_latino',
    label: 'Hispanic or Latino',
    options: ['Yes', 'No', EEO_DECLINE],
  },
  {
    key: 'veteran_status',
    label: 'Veteran status',
    options: [
      'I am not a protected veteran',
      'I identify as one or more of the classifications of protected veteran',
      EEO_DECLINE,
    ],
  },
  {
    key: 'disability_status',
    label: 'Disability status',
    options: [
      'Yes, I have a disability (or previously had one)',
      'No, I do not have a disability',
      EEO_DECLINE,
    ],
  },
]

/** Narrows the jsonb `eeo_disclosures` column to the known string-keyed shape.
 *  Anything non-object / non-string is dropped so the editor never crashes on
 *  malformed legacy data. */
export function parseEeoDisclosures(raw: Tables<'candidate_profiles'>['eeo_disclosures']): EeoDisclosures {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: EeoDisclosures = {}
  for (const key of EEO_FIELDS) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.length > 0) out[key] = value
  }
  return out
}

/* ─────────────────────── Custom screener answers ────────────────────── */

/** Slugifies a question label into a stable storage key:
 *  "What's your notice period?" → "whats-your-notice-period". Used as the
 *  application_answers.question_key, so editing the same label updates in place.
 *  Empty/punctuation-only labels collapse to '' (the caller skips those). */
export function slugifyQuestionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The typed shapes a screener answer can take — mirrors the extension's
 *  AnswerEntry.answerType + the application_answers.answer_type column. */
export type AnswerType = 'text' | 'textarea' | 'boolean' | 'select'

/** Answer types offered in the editor, with their UI copy. */
export const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Choice' },
  { value: 'textarea', label: 'Long text' },
]

/** Coerces a stored/free answer_type string to the typed union (default text). */
export function toAnswerType(raw: string | null | undefined): AnswerType {
  return raw === 'textarea' || raw === 'boolean' || raw === 'select' ? raw : 'text'
}

/** The four editable columns of an application_answers row (id/timestamps are
 *  DB-managed; user_id is supplied separately, never trusted from input). */
export type AnswerInput = Pick<
  TablesInsert<'application_answers'>,
  'question_key' | 'question_label' | 'answer' | 'answer_type'
>

/** Builds the application_answers upsert input from the editor fields, deriving
 *  the stable question_key slug. Returns null when the label yields no slug, so
 *  the caller can surface "add a question" rather than writing an unkeyed row. */
export function toAnswerInput(label: string, answer: string, type: AnswerType): AnswerInput | null {
  const question_label = label.trim()
  const question_key = slugifyQuestionKey(question_label)
  if (!question_key) return null
  return { question_key, question_label, answer, answer_type: type }
}

/* ──────────────────── Identity / eligibility view-model ─────────────── */

/** Editable identity + eligibility fields the Personal Info / Eligibility
 *  sections bind to. Strings only (the UI inputs are text/choice); the
 *  Yes/No sponsorship control maps to/from the boolean column at the edges. */
export interface ProfileForm {
  first_name: string
  last_name: string
  full_name: string
  preferred_name: string
  email: string
  phone: string
  phone_country: string
  location: string
  state: string
  linkedin_url: string
  website_url: string
  work_authorization: string
  requires_sponsorship: boolean | null
  security_clearance: string
  drivers_license: string
}

/** UI defaults — seed values shown before any save and in demo mode. These are
 *  the same identity placeholders the screen previously hardcoded as useState
 *  defaults, now centralized so load/reset reuse them. */
export const PROFILE_FORM_DEFAULT: ProfileForm = {
  first_name: 'John',
  last_name: 'Burkhardt',
  full_name: 'John Burkhardt',
  preferred_name: '',
  email: 'john@bktadvisory.com',
  phone: '(555) 867-5309',
  phone_country: 'US',
  location: '',
  state: '',
  linkedin_url: 'linkedin.com/in/johnburkhardt',
  website_url: '',
  work_authorization: 'US Citizen',
  requires_sponsorship: false,
  security_clearance: 'No',
  drivers_license: 'Yes',
}

/** Maps a loaded candidate_profiles row onto the editable form, falling back to
 *  the UI defaults for any empty column so the inputs are never blank-by-error. */
export function profileRowToForm(row: Tables<'candidate_profiles'>): ProfileForm {
  return {
    first_name: row.first_name || splitName(row.full_name).first,
    last_name: row.last_name || splitName(row.full_name).last,
    full_name: row.full_name || PROFILE_FORM_DEFAULT.full_name,
    preferred_name: row.preferred_name ?? '',
    email: row.email || PROFILE_FORM_DEFAULT.email,
    phone: row.phone || PROFILE_FORM_DEFAULT.phone,
    phone_country: row.phone_country || PROFILE_FORM_DEFAULT.phone_country,
    location: row.location ?? '',
    state: row.state ?? '',
    linkedin_url: row.linkedin_url ?? '',
    website_url: row.website_url ?? '',
    work_authorization: row.work_authorization || PROFILE_FORM_DEFAULT.work_authorization,
    requires_sponsorship: row.requires_sponsorship,
    security_clearance: row.security_clearance || PROFILE_FORM_DEFAULT.security_clearance,
    drivers_license: row.drivers_license || PROFILE_FORM_DEFAULT.drivers_license,
  }
}

/** Builds the candidate_profiles upsert patch from the form. linkedin_url /
 *  website_url are nullable columns, so empty strings persist as null rather
 *  than ''. eeo_disclosures is cast to the jsonb column type at the call site. */
export function formToProfilePatch(
  form: ProfileForm,
  eeo: EeoDisclosures,
): Partial<TablesInsert<'candidate_profiles'>> {
  const recomposed = [form.first_name, form.last_name].map((s) => s.trim()).filter(Boolean).join(' ')
  return {
    first_name: form.first_name,
    last_name: form.last_name,
    full_name: recomposed || form.full_name,
    preferred_name: form.preferred_name,
    email: form.email,
    phone: form.phone,
    phone_country: form.phone_country,
    location: form.location,
    state: form.state,
    linkedin_url: form.linkedin_url.trim() ? form.linkedin_url.trim() : null,
    website_url: form.website_url.trim() ? form.website_url.trim() : null,
    work_authorization: form.work_authorization,
    requires_sponsorship: form.requires_sponsorship,
    security_clearance: form.security_clearance,
    drivers_license: form.drivers_license,
    // jsonb column — cast to Json like settingsService casts last_target_job.
    eeo_disclosures: eeo as Json,
  }
}
