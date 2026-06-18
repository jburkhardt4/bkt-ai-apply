// BKT Apply-Macro — SPA session reader (content script).
//
// Injected ONLY on the BKT web-app origin (see manifest content_scripts). It
// reads the signed-in user's Supabase session from the SPA's localStorage and
// relays it to the background worker, which then makes RLS-scoped calls on the
// user's behalf (candidate_profiles, score-job-fit). This is the approved
// "extension reads the SPA session" handoff (spec §8): zero SPA code change,
// piggybacks the existing web login, no new credential. The token stays inside
// the extension — relayed via chrome.runtime only, never to an ATS page. No
// keys live here (BR-122).

import { extractSupabaseSession } from '../auth/session'
import { MSG } from '../messages'

function relay(): void {
  const session = extractSupabaseSession()
  // Always inform the background — including the signed-out case (session: null)
  // — so it clears a stale token when the user logs out.
  void chrome.runtime.sendMessage({ type: MSG.SESSION_PUSH, session }).catch(() => undefined)
}

relay()

// Re-read when the user returns to the tab: picks up a fresh login or a silently
// refreshed token without needing a page reload.
window.addEventListener('focus', relay)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') relay()
})
