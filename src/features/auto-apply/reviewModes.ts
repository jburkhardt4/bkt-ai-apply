// BKT AI-Apply — the three application-behaviour (review-mode) definitions,
// mirrored from AiApply.co's Auto / Hybrid / Review modes (order + copy) with
// our 80%+ Hybrid threshold (vs their 75%). Split from components/chrome.tsx so
// component files only export components.
//
// Single source of truth for BOTH surfaces that toggle the mode — the dashboard
// ReviewModeMenu dropdown (top-right) and the Preferences Application Behaviour
// cards — all wired to user_settings.review_mode. 'assist' is the id behind the
// "Hybrid mode" label.
import type { ReviewModeId } from './types'

export const REVIEW_MODES: { id: ReviewModeId; label: string; desc: string; icon: string }[] = [
  {
    id: 'auto',
    label: 'Auto mode',
    desc: 'Fully hands-off. Maximum speed. Our AI agent finds and applies to matching jobs for you.',
    icon: 'zap',
  },
  {
    id: 'assist',
    label: 'Hybrid mode',
    desc: 'Best balance of speed and control. We auto-apply to high-fit roles (80%+ match). You decide on the rest.',
    icon: 'user-round',
  },
  {
    id: 'review',
    label: 'Review mode',
    desc: 'Full control. Nothing sent without your approval. Review every match. Our agent handles the application once you approve.',
    icon: 'eye',
  },
]

/**
 * Auto-apply submission kill-switch derived from the selected mode, per the
 * Application-Behaviour contract:
 *   - Auto   → submissions running (paused: false) — auto-applies to all matches
 *   - Hybrid → submissions running (paused: false) — auto-applies to 80%+, queues the rest
 *   - Review → submissions PAUSED (paused: true)   — safety switch; everything queues for manual review
 *
 * `useReviewMode` writes this into user_settings.paused whenever the mode
 * changes so the kill-switch stays in lockstep with the mode. (The dashboard
 * Play/Pause is a SEPARATE control for the prospector search pipeline and never
 * touches `paused`.)
 */
export function pausedForMode(mode: ReviewModeId): boolean {
  return mode === 'review'
}
