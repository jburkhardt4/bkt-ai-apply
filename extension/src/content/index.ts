// BKT Apply-Macro — MV3 content script entry.
//
// On a supported ATS host it renders the Match-Score panel and offers a
// human-triggered "Autofill" affordance that runs the macro. The user stays in
// control and submits manually (BR-151). On unsupported hosts it is inert
// (UAT-5).
//
// ⚠️ SESSION HANDOFF NOT WIRED (spec §8). The fit data + autofill payload below
// are STUBS. The real values must come from the user's Supabase session — the
// profile from `candidate_profiles` and the score from the `score-job-fit` Edge
// Function, brokered by the background worker. That auth architecture is a
// pending decision and is intentionally NOT implemented here.

import { resolveBoardConfig } from '../configs'
import { applyAutofill } from '../autofill'
import { renderMatchScorePanel } from '../matchScorePanel'
import type { AutofillPayload, FitPanelData } from '../types'

/** STUB — replace with the real score once the session handoff is decided. */
function stubFitData(): FitPanelData {
  return { score: 0, recommendation: null, matched: [], missing: [], estimated: true }
}

/** STUB — replace with the user's real contact profile (RLS-scoped) post-handoff. */
function stubPayload(): AutofillPayload {
  return {}
}

function init(): void {
  const config = resolveBoardConfig(location.host)
  if (!config) return // inert on unsupported hosts (UAT-5)

  // Marker so a loaded-extension smoke (and the background) can confirm injection.
  document.documentElement.setAttribute('data-bkt-apply', config.ats)

  renderMatchScorePanel(stubFitData())

  if (!document.getElementById('bkt-autofill-btn')) {
    const btn = document.createElement('button')
    btn.id = 'bkt-autofill-btn'
    btn.type = 'button'
    btn.textContent = 'BKT: Autofill'
    // Human-triggered only — never auto-runs, never auto-submits (BR-151).
    btn.addEventListener('click', () => {
      void applyAutofill({ config, payload: stubPayload() })
    })
    document.body.appendChild(btn)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
