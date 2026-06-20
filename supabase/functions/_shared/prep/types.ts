/**
 * Prep-layer contracts (apply-macro server-side prep — ADR-009/012, BR-122/151/156).
 *
 * Pure type declarations only — NO runtime, NO Deno.*, NO URL imports — so every
 * sibling module that imports only these types stays trivially unit-testable
 * under vitest (mirrors _shared/submission/types.ts and resolveChannel.ts).
 *
 * The prep layer reads a posting's public ATS schema, normalizes it, maps the
 * caller's own candidate data onto it, and decides whether the result may be
 * auto-prepared or must be human review-gated. It NEVER auto-submits (BR-151)
 * and NEVER sends EEO/demographic/screener answers to an LLM.
 */

/** ATS families we can classify. Mirrors prepared_applications.ats_family CHECK. */
export type AtsFamily =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'workday'
  | 'other'

/** Anti-bot tier. Mirrors prepared_applications.antibot_tier CHECK. */
export type AntibotTier = 'low' | 'medium' | 'high' | 'unknown'

/** Where a mapped field's value came from. Mirrors prepared_application_fields.value_source. */
export type ValueSource = 'profile' | 'derived' | 'ai_draft' | 'default'

/** Prepared application lifecycle status. Mirrors prepared_applications.status CHECK. */
export type PrepStatus =
  | 'prepared'
  | 'needs_review'
  | 'ready_to_fill'
  | 'submitted'
  | 'stale'
  | 'blocked'

/** Who initiated the prep. Mirrors prepared_applications.prepared_by CHECK. */
export type PreparedBy = 'cron' | 'on_demand'

/** Prep mode. Mirrors prepared_applications.mode CHECK. */
export type PrepMode = 'auto' | 'hybrid'

/**
 * One normalized field extracted from an ATS form schema. `key` is canonical
 * (see canonicalKey.ts); `sensitive` marks EEO/work-auth/salary/legal fields the
 * DB invariant (BR-156) will force to review_gate=true regardless of value.
 */
export interface NormalizedField {
  /** Canonical field_key (e.g. 'first_name', 'eeo_gender', 'answer:why_us'). */
  key: string
  /** Human label as shown on the ATS form. */
  label: string
  /** ATS field type, best-effort ('text','select','file','boolean','textarea',…). */
  type: string
  /** Whether the ATS marks this field required. */
  required: boolean
  /** Enumerated option labels for select/multiselect fields, when present. */
  options?: string[]
  /** True for EEO/work-auth/salary/legal fields (always DB review-gated). */
  sensitive: boolean
}

/**
 * A whole posting's normalized schema. `raw` preserves the immutable source
 * schema JSON for prepared_applications.form_schema_snapshot (audit / replay).
 */
export interface NormalizedSchema {
  atsFamily: AtsFamily
  antibotTier: AntibotTier
  sourceUrl: string
  externalJobId: string | null
  fields: NormalizedField[]
  raw?: unknown
}

/**
 * The caller's own candidate data, resolved RLS-scoped by the edge function
 * (candidate_profiles + application_answers). Scalars mirror the canonical
 * vocabulary; `eeo` and `answers` are autofill-only and NEVER sent to the LLM.
 */
export interface CandidateData {
  fullName?: string
  firstName?: string
  lastName?: string
  preferredName?: string
  email?: string
  phone?: string
  phoneCountry?: string
  linkedin?: string
  website?: string
  location?: string
  state?: string
  workAuthorization?: string
  /** Tri-state: true → needs sponsorship, false → does not, undefined → unknown. */
  requiresSponsorship?: boolean
  securityClearance?: string
  /** EEO/demographic disclosures keyed by canonical key (eeo_gender, …). */
  eeo?: Record<string, string>
  /** Custom screener answers keyed by question_key (application_answers). */
  answers?: Record<string, string>
  /** Employment history block (jsonb passthrough). */
  employmentHistory?: unknown
}

/**
 * One field after mapping candidate data onto a NormalizedField. The shape
 * mirrors the prepared_application_fields columns 1:1 so the edge function can
 * insert these rows directly. `reviewGate` is the prep layer's intent; the DB
 * trigger (BR-156) will additionally force it true whenever isSensitive is true.
 */
export interface MappedField {
  fieldKey: string
  fieldLabel: string
  fieldType: string
  /** Resolved value (scalar/array/object) or null when none. */
  mappedValue: unknown
  valueSource: ValueSource
  confidence: number
  isSensitive: boolean
  reviewGate: boolean
  /** Optional free-text draft (Phase 5 scaffold — always review-gated). */
  freeTextDraft: string | null
  /** True when the value carries no PII unsafe to surface unredacted. */
  redactionSafe: boolean
}

/** The gating outcome for a whole prepared application. */
export interface PrepDecision {
  status: PrepStatus
  gatingReason: string | null
}
