# ADR-009: BKT Apply-Macro — Manual Source-Link Handoff + Simplify-style Chrome Extension

**Status:** Accepted (Phase 1 + 2a); Proposed (Phase 2b extension)
**Date:** 2026-06-16
**Extends:** ADR-006 (Full Auto-Submission); ADR-007 (Server-Side Match Scoring)
**Branch:** `simplifyAI-apply-macro`

---

## Context

JB wants the manual application workflow to feel like Simplify Jobs (a.k.a. Simplify
Copilot): from a discovered job, one click opens the real ATS posting and a browser
macro autofills the form, the human reviews/submits, and the app tracks it. The Jam
recording (`a351882f-…`) demonstrates Simplify's own extension autofilling a Greenhouse
form (`job-boards.greenhouse.io/philo/jobs/7958304?gh_src=Simplify`) with pause/resume
and manual field entry before submit.

Two facts shaped this ADR:

1. **ADR-006 deliberately deferred browser-channel autofill (Stagehand/Browserbase).**
   The server-side `submission-worker` is API-first (Greenhouse/Lever sendable, Ashby
   preview-only) and bootstraps a Browserbase session only as a stub
   (`browserAdapter.ts` returns `manual_required`). Autonomous DOM-driving was held
   back under SIGN-OFF-004 and the Phase 4 go-live decisions.

2. **The AI match engine already exists** (ADR-007): the `score-job-fit` Edge Function
   returns `overall_score` + sub-scores + `strengths[]` / `gaps[]` / `recommendation`,
   persisted to `ai_scores`, routed `match_scoring → anthropic` in `src/lib/ai-router.ts`.

A naïve reading of the SOW ("recreate Simplify's auto-apply") would reverse ADR-006's
deferral and build autonomous browser submission. We explicitly do **not** do that.

## Decision

We split the SOW into three tracks and frame the extension as **human-in-the-loop
assistive autofill**, not autonomous submission:

### Phase 1 — Job Source-Link handoff (BUILT, Accepted)

When `user_settings.review_mode` is `review` or `assist` (Hybrid), the Dashboard green
"Apply" button and the dashboard JD-sidebar "Apply" button **open the original Job
Source Link (`jobs.source_url`) in a new tab** and move the application into a
view-model **"Manual / In-progress"** status. A follow-up **"Mark as applied"** action
fires the existing audited `discovery → applied` transition. In `auto` mode the button
keeps its existing auto-apply behavior.

- **No new pipeline stage.** The in-progress marker is a client-written
  `application_events` row (`event_type='submission_attempt'`, `actor='jb_manual'`,
  `metadata={outcome:'in_progress', channel:'manual_open', source:'manual-apply'}`)
  while `stage` stays `discovery`. This satisfies event-sourcing (BR-002) without a
  CHECK-constraint migration and without touching `PipelineStage`. The only `stage`
  change (`→applied`) goes through the `transition_stage` RPC.
- The duplicated open-in-new-tab logic on `/search` was extracted into
  `src/features/auto-apply/openSourceUrl.ts`.
- The Preferences "Application" mode cards were unified to read/write the same
  persisted `user_settings.review_mode` as the Dashboard `ReviewModeMenu` (the cards
  were previously local-state-only; "Hybrid" maps to `assist`).

### Phase 2a — AI Match Score + Fit Summary in the JD sidebar (BUILT, Accepted)

The JD sidebars surface the existing `ai_scores` data **before** the user clicks Apply:
a 0–100 Match Score, a fit label, matched skills (`strengths[]`) and missing keywords
(`gaps[]`), plus a "queued / estimated" state when scoring was cost-capped to the
heuristic. A latest-row correctness bug in the embedded `ai_scores` select was fixed
(`order scored_at desc, limit 1`). The LLM scoring **input** now prefers the user's
uploaded master-resume text (read from the `documents` bucket when a `.txt` resume
exists) over the hardcoded keyword profile, falling back gracefully. No schema change;
cost-cap path (BR-052/104) untouched.

### Phase 2b — Apply-Macro Chrome Extension (PROPOSED — this ADR gates it)

A Manifest V3 Chrome extension that, on a supported ATS page, reads the DOM, references
per-ATS JSON field-mapping configs, and **autofills** the application form with the
user's stored profile/resume data — with the human present to review, resolve
CAPTCHAs/auth walls, and click submit. It renders the Phase 2a Match Score + Fit Summary
inline on the ATS page before apply. See the full design spec:
`docs/features/simplifyai-apply-macro-extension.md`.

**This is compatible with ADR-006's deferral, not a reversal of it**, because:

- The **human performs the submission**; the extension only assists data entry. There
  is no autonomous, unattended submit.
- It runs **client-side in the user's own authenticated browser session** — it does not
  bypass auth walls, defeat CAPTCHAs, or evade rate limits (BR-032/033/034 remain
  binding; the human handles anything the macro cannot).
- The autonomous server-side `submission-worker` (ADR-006) remains the path for
  API-first ATS in `assist`/`auto` mode. The extension is the path for the long tail of
  boards the worker cannot address, under `review`/`assist` manual handoff (Phase 1).

## Consequences

- **Positive:** delivers the Simplify experience for JB's manual workflow now (Phase 1
  link handoff + Phase 2a fit panel) with zero schema/migration risk; the extension is
  scoped behind its own spec + a hard human-in-the-loop guardrail, so it can ship board
  by board without touching the autonomy guardrails.
- **Trade-offs:** the extension is a net-new build surface (MV3, content scripts, a
  separate review + Chrome Web Store release pipeline) maintained outside the Vite SPA;
  per-ATS DOM mappings are brittle and need a versioned, remotely-updatable config.
- **Security posture:** the extension never embeds an LLM key — match scoring is
  brokered through the existing JWT-gated `score-job-fit` Edge Function (keys stay
  Supabase secrets per BR-122). Profile/resume data the extension injects is the user's
  own, fetched over the authenticated Supabase session.
- **Follow-ups:** (1) a real PDF→text extraction path to populate a pre-extracted
  resume-text field (Phase 2a is inert until a `.txt` resume exists in storage);
  (2) per-board DOM-mapping config authoring + drift monitoring; (3) Chrome Web Store
  listing, privacy disclosure, and a signed auto-update channel.

## Business Rules

New: **BR-149** (manual source-link handoff + in-progress marker), **BR-150**
(resume-text scoring input), **BR-151** (extension human-in-the-loop guardrail). See
`docs/domain/business-rules.md`.
