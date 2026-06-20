// BKT AI-Apply — view-model helpers for PreparedApplicationReview.tsx.
//
// Sibling non-component module (react-refresh/only-export-components forbids the
// component file from exporting these). Pure presentation logic only; the DB is
// authoritative for status + the BR-156 review_gate invariant — these helpers
// only MAP those truths onto badge tones / display strings.

import type { BktBadgeTone } from '@/components/bkt/BktBadge'
import type { PreparedApplicationFieldRow } from '@/features/applications/services/preparedApplicationService'

/** Maps a prepared_applications.status to a design-system badge tone. Unknown
 *  values fall back to neutral so a future status never renders untoned. */
export function statusTone(status: string): BktBadgeTone {
  switch (status) {
    case 'ready_to_fill':
      return 'success'
    case 'prepared':
      return 'info'
    case 'submitted':
      return 'brand'
    case 'needs_review':
      return 'warning'
    case 'blocked':
      return 'danger'
    case 'stale':
      return 'silver'
    default:
      return 'neutral'
  }
}

/** Humanizes a snake_case status / source token into Title Case for display
 *  ("needs_review" → "Needs review"). */
export function humanizeToken(token: string): string {
  if (!token) return ''
  const spaced = token.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A row prepared for rendering: the raw field plus a flattened display value
 *  and whether it must be human-reviewed before filling. review_gate is read
 *  straight from the DB row (BR-156 guarantees sensitive ⇒ review_gate). */
export interface ReviewFieldVM {
  key: string
  label: string
  type: string
  /** Human-readable value, or null when nothing was auto-mapped. */
  displayValue: string | null
  source: string
  confidencePct: number | null
  isSensitive: boolean
  reviewGate: boolean
}

/** Flattens a mapped_value jsonb into a short, safe display string. Objects /
 *  arrays (e.g. employment_history blocks) collapse to a compact summary rather
 *  than dumping raw JSON into the UI. Never throws on malformed data. */
export function displayMappedValue(value: PreparedApplicationFieldRow['mapped_value']): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length > 0 ? value : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    return keys.length > 0 ? `${keys.length} field${keys.length === 1 ? '' : 's'}` : null
  }
  return null
}

/** Builds the render view-model for one mapped field. Review-gated / sensitive
 *  fields keep their value hidden in the VM intent (the component shows a
 *  "needs your review" flag instead of the raw value for sensitive ones). */
export function toReviewFieldVM(field: PreparedApplicationFieldRow): ReviewFieldVM {
  const confidence = typeof field.confidence === 'number' ? Math.round(field.confidence * 100) : null
  return {
    key: field.field_key,
    label: field.field_label || field.field_key,
    type: field.field_type || 'text',
    displayValue: displayMappedValue(field.mapped_value),
    source: field.value_source,
    confidencePct: confidence,
    isSensitive: field.is_sensitive,
    reviewGate: field.review_gate,
  }
}
