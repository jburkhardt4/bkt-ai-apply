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

/** Argument to the in-page autofill function. */
export interface AutofillInput {
  config: BoardConfig
  payload: AutofillPayload
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
