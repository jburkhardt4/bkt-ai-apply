# ADR-013: Headless Prep Pipeline + `prepared_*` Data Model

- **Status:** Accepted
- **Date:** 2026-06-20
- **Relates:** ADR-006 (server-side submission worker), ADR-009 (apply-macro extension), ADR-011 (extension session handoff), ADR-012 (candidate profile + answer library), migration `20260620000001_prepared_applications`
- **Research:** *BKT AI-Apply: Job-Board Research & Revised Headless-Prep Architecture (2026-06-20)*

## Context

The apply-macro (ADR-009/011/012) lets the user's own browser session autofill an ATS form from `candidate_profiles`, with the human submitting. To scale this beyond hand-written per-board selector configs we need: (a) to **read the actual application-form schema** of a posting from the ATS's public read API, (b) a place to persist the **per-field mapping** of the user's profile onto that schema (with confidence + sensitivity), and (c) a **mode-gating policy** that decides what may be prepared unattended vs. what must wait for human review.

The job-board research established the routing reality: **Greenhouse, Lever, Ashby, and SmartRecruiters expose auth-free JSON read APIs (jobs + the application-form question schema) and host the apply form themselves** — near-zero anti-bot risk for *reading*. **Workday, LinkedIn, Indeed** are scraping-hostile (Akamai / ToS bans / behavioral detection) and must never be read headlessly. Reading is the gating input; submitting is never done headlessly here.

## Decision

**1. Two new tables — `prepared_applications` + `prepared_application_fields`** (separate from ADR-006's `submission_previews`). `submission_previews` is a 1:1-per-application snapshot of a would-be **POST** for the headless-submit path; the prep model is a richer **per-field** record for the read-prep + human-submit path. They serve different paths, so they are separate tables.

- `prepared_applications` — one row per job-prep attempt: `job_ref`, `ats_family`, `antibot_tier`,
  `form_schema_snapshot` (immutable), `match_score`, `mode` (`auto|hybrid`), `status`
  (`prepared|needs_review|ready_to_fill|submitted|stale|blocked`), `gating_reason`,
  `document_versions`, `prepared_by` (`cron|on_demand`). RLS own-row; upsert key
  `(user_id, job_id)` for re-prep.
- `prepared_application_fields` — one row per mapped field: `field_key`/`field_label`/`field_type`,
  `mapped_value`, `value_source` (`profile|derived|ai_draft|default`), `confidence`,
  `is_sensitive`, `review_gate`, `free_text_draft`, `redaction_safe`.

**2. Sensitive ⇒ review-gated, enforced in the database (BR-156).** A `BEFORE INSERT/UPDATE`
trigger (`fn_prepared_field_force_gate`) auto-forces `review_gate = true` whenever
`is_sensitive = true`, and a `CHECK (NOT is_sensitive OR review_gate)` guarantees the invariant
even if the trigger is ever disabled. Sensitive = demographic/EEO, work authorization,
salary/compensation, security clearance, legal attestation. Sensitive fields are stored but
**never auto-filled** — the human supplies/confirms them.

**3. Anti-bot tier is a first-class adapter output, not a hard-coded platform check (BR-157).**
Each ATS family resolves to an `antibot_tier` (`low` for greenhouse/lever/ashby/smartrecruiters,
`high` for workday, `unknown` for other). The prep pipeline gates on the **tier**, so adding a
new platform never means editing the pipeline.

**4. Mode-gating policy.** Auto-mode unattended prep is allowed **only when all** hold: (1) family
in the low anti-bot tier; (2) no sensitive/legal gating field in the schema; (3) `match_score ≥ 75`;
(4) source is a read-API surface (not LinkedIn/Indeed/Glassdoor/Workday). Any failure →
`status = 'needs_review'` with a `gating_reason`. Hybrid on-demand requires `match_score > 80` to
auto-kick-off; an explicit user-initiated prep (`prepared_by = 'on_demand'`) bypasses the score
gate but still review-gates every sensitive field. **Workday/LinkedIn/Indeed are never Auto-eligible.**

**5. Complement, not replace.** This read-prep + human-submit path is the **gap-filler** shipped
now; ADR-006's live ATS **POST** adapters (`_shared/submission/atsAdapters.ts`) stay frozen /
kill-defaulted (dry-run) until hardened. The two coexist: prep + extension is human-in-the-loop;
the headless-submit path remains deferred (chosen by JB, 2026-06-20).

**6. Prep is NOT event-sourced into `application_events`.** That table is the immutable
system-of-record for `applications.stage` transitions, with **closed** `event_type`/`actor` CHECK
sets (no `prepared`/`cron` values) and a `NOT NULL` `application_id`. Prep is a *pre-application*
activity that changes no stage and may precede any `applications` row. `prepared_applications` is
**self-auditing** (`status` + `gating_reason` + timestamps); the `discovery → applied` event is
written by the **existing submit flow** when the human actually submits (BR-158).

## Components

- `supabase/functions/_shared/prep/` — pure, Deno-free, vitest-tested modules: `atsFamily`
  (detect family + tier), `buildReadEndpoint` (auth-free GET per family), `schemaParse` (raw ATS
  JSON → normalized fields), `canonicalKey` (ATS label/name → canonical key vocabulary),
  `sensitivity` (classify), `fieldMap` (profile → mapped fields), `gating` (mode policy),
  `draftFreeText` (Phase 5 scaffold, always review-gated).
- `supabase/functions/prepare-application/` — Deno edge function; on-demand JWT path writes
  RLS-scoped prep rows as the caller (anon key + the user's `Authorization` header — **no
  service-role for on-demand**, BR-122).
- `extension/src/` — `preparedFill` (prepared fields → autofill payload, **excluding** review-gated
  fields), `stopConditions` (CAPTCHA/MFA/login-wall detection), a `BKT_PREPARED` message; the
  content script prefers prepared data, surfaces gated fields + stop-conditions, never auto-submits.
- `src/features/applications/services/preparedApplicationService.ts` + a hook + a minimal review
  surface (read prepared records, trigger on-demand prep, flag gated fields).

## Canonical field-key vocabulary

The server `field_key`s match the extension payload keys verbatim (`first_name`, `last_name`,
`full_name`, `preferred_name`, `email`, `phone`, `phone_country`, `linkedin`, `website`,
`location`, `state`, `work_auth`, `requires_sponsorship`, `resume`, `cover_letter`, `eeo_*`,
`employment_history`, and custom screeners as `answer:<question_key>`) so the extension can consume
server-prepared fields with no translation layer.

## Alternatives considered

- **Extend `submission_previews`** with per-field detail — rejected; conflates the headless-submit
  preview (1:1, would-be POST) with the read-prep model (per-field, human-submit) and overloads a
  table keyed 1:1 to `application_id`.
- **Auto-submit on low-anti-bot ATS** (ADR-006 live path "on") — deferred; reCAPTCHA/Akamai bite at
  *submit*, and the human-in-the-loop extension is the safer gap-filler (Decision 5).
- **Headless-read Workday CXS / scrape LinkedIn-Indeed** — rejected; Akamai/ToS/behavioral
  detection make unattended reading a real account/legal risk (the *hiQ v. LinkedIn* judgment).
  Those roles are prepared only via the in-session extension (live DOM the user already views).

## Consequences

- Re-verify each ATS read API before trusting it; pin behavior with `schemaParse` fixtures.
  Greenhouse's Harvest v1/v2 deprecate after 2026-08-31, but the **Job Board GET API** the prep
  layer uses is separate and stays auth-free.
- Schema parsers are best-effort against documented (largely unverified) field shapes — **live-tune**
  before trusting, same caveat class as the extension's per-board selectors.
- AI free-text drafting (`draftFreeText`) is scaffolded only; any future draft is **always**
  `review_gate = true` and never auto-submitted, and EEO/answers are never sent to the LLM.
- Workday/other families return "unsupported for headless read" and route to the extension session.
