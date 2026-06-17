// BKT Apply-Macro — MV3 background service worker (skeleton).
//
// ⚠️ Holds NO Supabase session yet. The session-handoff architecture — how the
// extension authenticates to fetch the user's profile (candidate_profiles) and
// call the score-job-fit Edge Function with the user's JWT — is a PENDING
// DECISION (spec §8) and is intentionally not implemented. For now this worker
// only acknowledges install and stubs the message channel the content script
// will use once auth is wired. No keys, no service-role, ever (BR-122).

chrome.runtime.onInstalled.addListener(() => {
  console.info('[bkt-apply] extension installed')
})

chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  // TODO(session-handoff): route { type: 'score' | 'profile' } requests through
  // the user's Supabase session once the auth architecture is approved.
  sendResponse({ ok: false, reason: 'session_handoff_pending' })
  return true
})
