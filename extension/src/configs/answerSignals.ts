import { SENSITIVE_KEYS } from './fieldSignals'
import type { AnswerEntry } from '../types'

/**
 * Enrichment for the B4 Master Answers Library (ADR-014). The `application_answers`
 * table stores question_key / question_label / answer / answer_type — but NOT the
 * alias phrasings or the sensitivity flag the macro needs. Those live here, keyed
 * by question_key, and are joined onto each row by {@link toAnswerEntries} when the
 * background hands answers to the injected matcher.
 */

/** The application_answers columns the background reads. */
export interface ApplicationAnswerRow {
  question_key: string | null
  question_label: string | null
  answer: string | null
  answer_type: string | null
}

/**
 * Alternate question phrasings per answer key, matched (in addition to the stored
 * question_label) against a form's <label> by the Answer Library pass. Lowercase;
 * the matcher normalizes + substring-matches them, unambiguous-or-skip (autofill.ts).
 * Keep each phrase distinctive enough to hit ONE screener, never two.
 */
export const ANSWER_ALIASES: Record<string, string[]> = {
  sf_years: ['years of salesforce experience', 'salesforce experience'],
  sf_admin_years: ['salesforce administration', 'salesforce administrator experience'],
  sf_architect_years: ['salesforce architect', 'architecture decisions', 'as an architect'],
  pm_years: ['project management experience', 'years of project management'],
  ba_years: ['business analysis experience'],
  apex_years: ['apex experience', 'years of apex'],
  lwc_years: ['lightning web components', 'lwc experience'],
  api_years: ['salesforce api', 'api experience'],
  sales_cloud_years: ['sales cloud'],
  service_cloud_years: ['service cloud'],
  ai_years: ['artificial intelligence', 'ai experience'],
  implementations: ['full-lifecycle implementations', 'full lifecycle implementations', 'number of implementations'],
  relocation: ['willing to relocate', 'open to relocation', 'relocate'],
  age_18: ['at least 18', '18 years of age', '18 or older'],
  prior_employment: ['previously been employed', 'previously employed', 'former employee'],
  family_employed: ['family members employed', 'relatives employed', 'family member who works'],
  notice_text: ['notice period', 'notice required', 'when can you start'],
  notice_select: ['notice period', 'notice required', 'when can you start'],
  work_auth: ['authorized to work', 'work authorization', 'legally authorized', 'lawfully'],
  requires_sponsorship: ['require sponsorship', 'visa sponsorship', 'sponsorship now or in the future'],
  desired_salary: ['desired salary', 'salary expectation', 'desired annual base salary', 'compensation expectation'],
  certifications: ['certifications', 'certification', 'professional certifications'],
}

/** Coerce the free-string answer_type column to the typed union (default text). */
function normalizeAnswerType(t: string | null): AnswerEntry['answerType'] {
  const v = (t ?? '').trim().toLowerCase()
  return v === 'boolean' || v === 'select' || v === 'textarea' ? v : 'text'
}

/**
 * Maps RLS-scoped application_answers rows into the AnswerEntry[] the macro fills,
 * joining each with its alias phrasings (ANSWER_ALIASES) and its sensitivity
 * (SENSITIVE_KEYS — work-auth / sponsorship / salary stay review-gated, NEVER
 * auto-filled, BR-156). Rows with no key or a blank answer are dropped.
 */
export function toAnswerEntries(rows: ApplicationAnswerRow[]): AnswerEntry[] {
  const out: AnswerEntry[] = []
  for (const r of rows) {
    const questionKey = r.question_key?.trim()
    const answer = r.answer
    if (!questionKey || typeof answer !== 'string' || !answer.trim()) continue
    out.push({
      questionKey,
      questionLabel: (r.question_label ?? '').trim(),
      aliases: ANSWER_ALIASES[questionKey],
      answer,
      answerType: normalizeAnswerType(r.answer_type),
      sensitive: SENSITIVE_KEYS.has(questionKey),
    })
  }
  return out
}
