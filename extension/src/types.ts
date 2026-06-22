// BKT Apply-Macro — shared types for the MV3 extension (Phase 2b).
//
// Pure type module (no runtime imports) so it is safe to import from the content
// script, the background worker, and tests alike. Mirrors the JSON field-mapping
// config schema in docs/features/simplifyai-apply-macro-extension.md §3.2.

/** A single fillable field, mapping a canonical profile key to an ATS selector. */
export interface FieldConfig {
  /** Canonical profile key (first_name, email, …); drives the payload lookup. */
  key: string
  /** CSS selector for the field on the ATS page. */
  selector: string
  /** Input kind — selects the fill strategy. */
  type: 'text' | 'tel' | 'email' | 'url' | 'textarea' | 'select' | 'react-select' | 'file'
  /** Explicit custom-widget strategy (e.g. react-select option clicking). */
  strategy?: 'react-select'
  /**
   * Visible-label synonyms for the B5 multi-signal fallback matcher (ADR-014 D4).
   * Used ONLY when `selector` misses — e.g. Greenhouse's job-boards template keys
   * every field by an opaque `#question_<id>`, so the only durable locator is the
   * field's `<label>` text. Lowercase; matched as normalized substrings, and
   * UNAMBIGUOUSLY-or-skip — it never guesses between two fields (UAT-4).
   */
  labels?: string[]
  /**
   * Sensitive field (EEO / work-auth / sponsorship / legal / salary / clearance).
   * The label matcher NEVER auto-locates these (BR-156) — they stay human/review.
   * A direct, explicit `selector` still applies where a board provides one.
   */
  sensitive?: boolean
}

/** Per-ATS, versioned, remotely-updatable field-mapping config (spec §3.2). */
export interface BoardConfig {
  ats: string
  version: string
  match: { hosts: string[] }
  jd: { container: string; title: string }
  fields: FieldConfig[]
  /** Submit affordance. `autoClick` is ALWAYS false — the human submits (BR-151). */
  submit: { selector: string; autoClick: false }
}

/** Flat payload of resolved string values keyed by FieldConfig.key. */
export type AutofillPayload = Record<string, string>

/** Why a field was not auto-filled — surfaced to the user, never fabricated (§5.2). */
export type SkipReason = 'not_found' | 'no_value' | 'manual_required' | 'needs_strategy'

/** Result of one macro run — drives the "filled what it could" UX (spec §4.3). */
export interface AutofillReport {
  filled: string[]
  missing: string[]
  skipped: { key: string; reason: SkipReason }[]
}

/**
 * A pre-stored standing answer to a recurring custom screener — the Master
 * Answers Library (ADR-014 B4), persisted in `application_answers`. The macro
 * locates the field by matching `questionLabel` / `aliases` against the form's
 * visible <label> text (the opaque `#question_<id>` screeners have no stable
 * selector), then fills `answer` per `answerType`. `sensitive` answers
 * (salary / EEO / work-auth / legal) are NEVER auto-filled — review-gated (BR-156).
 */
export interface AnswerEntry {
  /** Stable key (application_answers.question_key) — used for reporting. */
  questionKey: string
  /** Canonical question text (application_answers.question_label) — matched, normalized, against the form's <label>. */
  questionLabel: string
  /** Alternate phrasings of the same question, also matched. */
  aliases?: string[]
  /** The stored value to fill (an option's visible label, for choice types). */
  answer: string
  /** Shapes how the field is located + filled. */
  answerType: 'text' | 'textarea' | 'select' | 'boolean'
  /** Review-gated → never auto-filled, surfaced for the human (BR-156). */
  sensitive?: boolean
}

/** Argument to the in-page autofill function. */
export interface AutofillInput {
  config: BoardConfig
  payload: AutofillPayload
  /** Master Answers Library entries filled beyond the board's known fields (B4). */
  answers?: AnswerEntry[]
}

/** Data for the injected Match-Score panel (mirrors the Phase 2a JobFitPanel). */
export interface FitPanelData {
  score: number
  recommendation: 'apply' | 'consider' | 'reject' | null
  matched: string[]
  missing: string[]
  /** True when the score is the cost-capped heuristic estimate (BR-141). */
  estimated?: boolean
}
