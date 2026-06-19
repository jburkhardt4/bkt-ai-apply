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

// NOTE: Review mode no longer toggles user_settings.paused. The server-
// authoritative claim_submission floor (migration 20260618000001) already
// enforces the Application-Behaviour contract per mode — review never submits
// autonomously and requires an explicit `approval` event. Because the worker
// checks `paused` BEFORE the approval path, pausing for Review mode also
// blocked packets the user had explicitly approved. `paused` is therefore left
// as an independent user kill-switch, decoupled from the selected mode.
