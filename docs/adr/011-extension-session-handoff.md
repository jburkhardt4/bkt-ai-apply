# ADR-011: Apply-Macro Extension Session Handoff — "Extension Reads the SPA Session"

- **Status:** Accepted
- **Date:** 2026-06-18
- **Supersedes / relates:** ADR-009 (apply-macro Chrome extension), ADR-007 (server-side match scoring)

## Context

The MV3 apply-macro extension (ADR-009) needs the signed-in user's identity to:

1. Fetch the user's `candidate_profiles` row → contact fields for autofill, plus
   location / work-authorization and master-resume text for scoring.
2. Call the JWT-gated `score-job-fit` Edge Function → the Match-Score panel.

Hard constraints:

- **No provider or service-role key may ever live in the extension bundle**
  (BR-122). Model calls stay brokered server-side by `score-job-fit` (the
  Anthropic key is a project secret).
- Every read must be **RLS-scoped to the user** (BR-005) — no cross-user leakage.
- We do not want a second credential or a second login for the user.

## Decision

**The extension reads the SPA's existing Supabase session.** (Chosen by JB,
2026-06-18.)

- A **SPA-origin reader content script** (`extension/src/content/spa-session.ts`),
  injected *only* on the BKT web-app origins (`bkt-ai-apply.vercel.app`,
  `localhost:5173`, `*.app.github.dev`), reads the supabase-js session from
  `localStorage['sb-<ref>-auth-token']` (scanned, not hardcoded) and relays it to
  the background worker via `chrome.runtime` messaging. It re-reads on
  focus/visibility so a fresh login or a silently-refreshed token propagates.
- The **background worker** stores the session in `chrome.storage.session`
  (memory-only, never written to disk, not readable by content scripts) and
  builds a Supabase client with the **public anon key** (`config.ts`, injected at
  build time from `.env.local`) + the user's **JWT** as `Authorization: Bearer`.
  PostgREST and the Edge Function therefore see the user → RLS confines every read
  to their own rows. No service role, ever.
- Scoring passes `provider: 'anthropic'` / `model: 'Claude Sonnet 4.6'`, mirroring
  `src/lib/ai-router.ts` `ROUTING_MATRIX.match_scoring` (the Edge Function maps the
  display name → API id server-side). The scoring `profile` carries **fit-relevant
  fields only** (location, work-authorization, master-resume text) — **no contact
  PII** is sent to the LLM. Contact fields are used solely for autofill.

## Security Envelope

- Only credentials in the extension: the **public anon key** (the same one the SPA
  already ships) and the **user's own JWT**. No service-role, no provider keys
  (BR-122).
- The token is relayed via `chrome.runtime` only and stored extension-private —
  never exposed to an ATS page or any third party.
- The macro **never auto-submits** (BR-151); scoring and autofill are both
  human-triggered.

## Alternatives Considered

- **Dedicated extension login** — rejected: a second credential and extra friction
  for zero security gain over the user's existing web session.
- **SPA pushes the session via `window.postMessage` / `externally_connectable`** —
  more explicit, but requires SPA code changes and manifest key management.
  Deferred as a possible future hardening; the read-from-storage approach ships
  with zero SPA change.

## Consequences

- **Token refresh:** the reader re-reads on focus; an expired token → background
  reports `needs_login` → the panel prompts the user to sign in at the BKT app.
- **Testability:** the deterministic half (session extraction) is covered by
  Playwright fixtures (`e2e/extension/auth-session.spec.ts`) and the loaded-extension
  smoke asserts the signed-out content↔background round-trip. The **live** calls
  (`candidate_profiles` + `score-job-fit` with a real JWT) require a signed-in
  session against real Supabase and are verified **manually** — they are not
  fixture-mockable.
- **Resume enrichment** stays inert until a `.txt` master resume exists (BR-150);
  scoring proceeds on the structured fields when absent.
