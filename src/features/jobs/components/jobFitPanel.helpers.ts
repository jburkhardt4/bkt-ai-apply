// BKT AI-Apply — JobFitPanel presentation helpers (sibling, non-component).
//
// Lives in its own module so JobFitPanel.tsx exports ONLY its component
// (react-refresh/only-export-components is an error in this repo).
//
// IMPORTANT (LSN-001): these boundaries are PRESENTATION-ONLY fit labels for the
// score readout, mirroring the existing JDSidebar Job Fit tab (>=80 strong /
// >=65 possible / below weak). They are NOT the BR-020/021 business thresholds
// and are never used to make a scoring/recommendation decision — the
// authoritative recommendation comes from ai_scores.recommendation (derived
// server-side from overall_score via BR-142).

export type JobFitState = 'loading' | 'ready' | 'unscored' | 'queued' | 'error'

export interface FitLabel {
  /** Short label shown next to the score. */
  text: string
  /** Semantic CSS variable for the label color (matches JDSidebar bkt tokens). */
  colorVar: string
}

const STRONG_FIT_MIN = 80
const POSSIBLE_FIT_MIN = 65

/** Maps a 0-100 score to a presentation fit label + color token. */
export function getFitLabel(score: number): FitLabel {
  if (score >= STRONG_FIT_MIN) return { text: 'Strong fit', colorVar: 'var(--bkt-score-high)' }
  if (score >= POSSIBLE_FIT_MIN) return { text: 'Possible fit', colorVar: 'var(--bkt-score-good)' }
  return { text: 'Weak fit', colorVar: 'var(--bkt-score-mid)' }
}
