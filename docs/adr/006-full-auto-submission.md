# ADR-006: Full Auto-Submission with Server-Enforced Guardrails

**Status:** Accepted
**Date:** 2026-06-12
**Supersedes:** BR-040 (explicit approval for every submission) and BR-041
(Stagehand browser automation deferred Post-MVP) — both from SIGN-OFF-004.
Extends BR-021 (score ≥ 80 → Auto-Submit packet + approval gate).

---

## Context

The redesigned Auto-Apply surface ships three review modes (`review` / `assist`
/ `auto` — `src/features/auto-apply/reviewModes.ts`), but under BR-040 every
mode collapsed to manual approval: stage transitions were recorded, no
application was ever actually submitted. JB has decided (2026-06-12) that the
product target is genuine end-to-end auto-apply: discovery → scoring →
tailored documents → **real submission** — with the autonomy level chosen per
user via review mode.

Two submission channels exist in the data model but were never implemented:
`jobs.application_method` distinguishes `api`/`ats` postings (Greenhouse,
Ashby, Lever expose public application endpoints — unvalidated, GAP-010) from
`manual` postings that require driving a browser. Edge Functions cannot run a
browser, so browser-channel submission needs an external execution service.

## Decision

1. **Review-mode semantics become enforceable behavior.**
   - `review` (default): every queued application requires explicit JB approval
     before submission.
   - `assist`: applications scoring at or above the threshold auto-queue as
     `approved`; everything else waits for approval.
   - `auto`: applications scoring at or above the threshold are submitted
     autonomously, subject to the guardrails below.

2. **All autonomy guardrails are enforced server-side** in the submission
   worker (service role) — never trusted to the client:
   - **Score threshold** — `user_settings.auto_submit_score_threshold`
     (default 80, aligning with BR-021's packet-prep threshold).
   - **Budget/credits** — submission decrements `user_settings.credits`
     atomically; zero credits or exhausted monthly budget halts auto/assist
     queueing and submission.
   - **Daily cap** — `user_settings.daily_submission_cap` (default 10)
     bounds submissions per rolling 24 h.
   - **Kill switch** — `user_settings.paused = true` stops the worker for
     that user immediately (the dashboard Pause toggle writes this).
   - **No duplicates** — one queue row per application
     (`application_queue UNIQUE (application_id)`); `jobs.source_url`
     uniqueness already prevents re-discovery duplicates (BR-063/BR-102).

3. **Queue + worker architecture.** A new `application_queue` table holds
   submission intents (`pending_approval → approved → submitting → submitted |
   failed | cancelled`). A scheduled Edge Function worker drains `approved`
   rows. Every attempt and outcome writes an `application_events` row
   (event-sourcing non-negotiable #4 — the queue is workflow state, the event
   log remains the source of truth).

4. **Submission channels, API-first.** Postings with
   `application_method = 'api' | 'ats'` submit via direct ATS endpoint
   adapters (Greenhouse/Ashby/Lever; GAP-010 spike required). All others fall
   back to **cloud browser automation via Browserbase + Stagehand** driven
   from the worker over API (`BROWSERBASE_API_KEY` as an Edge Function
   secret). BR-032/033/034 remain binding: no CAPTCHA bypass, no rate-limit
   circumvention, no scraping behind auth walls — a posting that cannot be
   submitted within those rules fails the queue row with a reason and falls
   back to manual.

5. **Phasing.** This ADR lands the schema (`user_settings`,
   `application_queue`) and rules now; the worker + channel adapters are
   Phase 4 of the 2026-06-12 roadmap. Until the worker ships, all modes
   behave as `review` (no behavioral regression).

## Consequences

- BR-040/BR-041 are superseded; `docs/domain/business-rules.md` gains
  BR-130…BR-136 (autonomy rules) and annotates the superseded rows.
- Credits/budget move from localStorage to `user_settings` (server-
  authoritative); the client becomes a view of that state (Phase 2 swap in
  `src/features/auto-apply/state.ts`).
- A failed submission is visible (queue row `failed` + event + notification),
  never silent.
- New external dependency (Browserbase) and secret (`BROWSERBASE_API_KEY`);
  per-submission cost must be logged like AI usage for budget enforcement.
- Stage truth: an application transitions `discovery → applied` only when a
  submission actually succeeds (or JB marks it manually) — the dashboard's
  optimistic "Application queued" toast maps to queueing, not submission.
