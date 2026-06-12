// BKT AI-Apply — the three review-mode definitions (split from
// components/chrome.tsx so component files only export components).
import type { ReviewModeId } from './types'

export const REVIEW_MODES: { id: ReviewModeId; label: string; desc: string; icon: string }[] = [
  { id: 'review', label: 'Review mode', desc: 'You approve every application before it is sent.', icon: 'eye' },
  { id: 'assist', label: 'Assist mode', desc: 'Strong matches queue automatically; you review the rest.', icon: 'wand-sparkles' },
  { id: 'auto', label: 'Full auto', desc: 'Applications above your score threshold send instantly.', icon: 'zap' },
]
