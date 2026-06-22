# Overnight Run — Headless Prep Pipeline + `prepared_*` Data Model (ADR-013)

**Date:** 2026-06-20 (overnight, autonomous) · **Branch:** `simplifyAI-apply-macro`
**Exit condition MET:** schema + configs fully mapped, full suite passes with **0 errors**.

---

## TL;DR

Built the **"headless prep + human submit"** pipeline from the 2026-06-20 job-board research, at the
scope you locked: **Full pipeline + extension**, **new `prepared_*` tables**, **Complement** (the
ADR-006 live ATS-POST adapters stay frozen; prep + the human-in-the-loop extension is the gap-filler).
The server reads a posting's ATS form schema from its **public, auth-free read API**, maps your profile
onto it with per-field confidence + sensitivity, and the extension fills the **non-sensitive** fields in
your own session — you click submit. Sensitive fields (EEO/work-auth/salary/legal) are **review-gated in
the database** and never auto-filled.

Delegated per your Step D: `@ai-integrations` built the server prep layer + the extension changes;
`@feature-dev` built the frontend service/hook/review surface. I owned the stateful spine (migration,
types, authoritative validation, self-heal, docs).

## Green gates (authoritative, run by the orchestrator)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` (`tsc -b`) | ✅ 0 errors |
| `pnpm lint` (`eslint .`) | ✅ 0 problems |
| `pnpm test` (vitest) | ✅ 41 files / **375 tests** |
| `pnpm build:ext` | ✅ bundle ready |
| `deno check` (prepare-application) | ✅ 0 (after import-map fix) |
| `xvfb-run pnpm test:ext` (Playwright) | ✅ **25/25** (incl. 3 new prepared-fill specs) |

Independent adversarial verifiers (one per tree) re-ran scoped validation and returned **pass** on all
three, confirming the changes are additive (broke no existing test) and the invariants hold.

## What shipped

### Database — migration `20260620000001_prepared_applications` (applied to hosted `rmoyuwesfljuygvpdolf` via MCP)

- **`prepared_applications`** — one row per prep attempt: `job_ref`, `ats_family`, `antibot_tier`,
  `form_schema_snapshot`, `match_score`, `mode`, `status`, `gating_reason`, `document_versions`,
  `prepared_by`. RLS own-row; `(user_id, job_id)` upsert index.
- **`prepared_application_fields`** — one row per mapped field: `value_source`, `confidence`,
  `is_sensitive`, `review_gate`, `free_text_draft`, `redaction_safe`. RLS own-row.
- **BR-156 enforced in the DB**: trigger `fn_prepared_field_force_gate` forces `review_gate=true` when
  `is_sensitive=true`, plus `CHECK (NOT is_sensitive OR review_gate)`. Security advisor clean
  (`search_path=''`).

### Server prep layer (`@ai-integrations`) — `supabase/functions/`

- Pure, Deno-free, **vitest-tested (63 tests)** modules in `_shared/prep/`: `atsFamily`,
  `buildReadEndpoint`, `schemaParse` (Greenhouse/Lever/Ashby/SmartRecruiters), `canonicalKey`,
  `sensitivity`, `fieldMap`, `gating`, `draftFreeText` (Phase-5 scaffold).
- `prepare-application/` edge function — on-demand, **RLS-scoped to the caller** (anon key + forwarded
  JWT, `user_id` from `auth.getUser()`, no service-role), reads schema → maps → gates → upserts the prep
  rows. `deno check` green via the import-map bare specifier.

### Extension (`@ai-integrations`) — `extension/src/`

- `preparedFill.ts` (excludes review-gated fields), `stopConditions.ts` (CAPTCHA/MFA/login-wall),
  `BKT_PREPARED` message + `handlePrepared`. Content script **prefers** prepared data, surfaces gated
  fields + stop-conditions, **never auto-submits** (`autoClick:false`). Greenhouse config +
  `phone_country`. New `preparedFill.spec.ts` (Playwright).

### Frontend (`@feature-dev`) — `src/features/`

- `preparedApplicationService.ts` (+17 tests), `usePreparedApplications` hook, `PreparedApplicationReview.tsx`
  (flags review-gated fields "Needs your review", hides their values). Verified the existing
  Preferences→`candidate_profiles` wiring is intact (no redo).

## Mode-gating policy (BR-157)

Auto-mode unattended prep is allowed only when **all** hold: family in the low anti-bot tier
{greenhouse, lever, ashby, smartrecruiters} · no sensitive field in the schema · `match_score ≥ 75` ·
source is a read-API surface. Otherwise → `needs_review` with a `gating_reason`.
**Workday / LinkedIn / Indeed are never Auto-eligible and are never headless-read.**

## Docs updated

- `docs/adr/013-headless-prep-and-prepared-applications.md` (new)
- `docs/requirements/03-data-entities.md` → E-017/E-018, count 16→18
- `docs/domain/business-rules.md` → BR-156–160
- Project memory: `headless-prep-pipeline.md` (+ index)

## Remaining (live-tune / follow-ups — NOT blockers; build is green)

1. **ATS read-endpoint shapes are live-tune**: Ashby + SmartRecruiters response envelopes and the Lever
   custom-question key are UNVERIFIED against real postings. Parsers fail safe (a misparse downgrades to
   `needs_review`, never a silent auto-prep). Verify each against one live posting before production prep.
2. **Prep cron** (`prepared_by='cron'`) is a guarded **501 scaffold** — batch auto-prep is the next build.
3. **AI free-text drafting** (`draftFreeText`) is a Phase-5 scaffold (returns `{draft:null}`); wiring it
   through `src/lib/ai-router.ts` is the next step (always review-gated, never to the LLM for EEO/answers).
4. **`PreparedApplicationReview`** is built and tested but **not yet mounted** in a route — wire it into the
   auto-apply UI when the prep flow goes live.
5. **`employment_history` editor** in Preferences deferred (column exists; UI carried disproportionate risk).
6. `prepare-application` edge function is **not yet deployed** to the hosted project (separate
   `deploy_edge_function` step when you're ready to exercise on-demand prep live).

## Notes

- **Not committed** — you said "commit" only last time after the run; this run's exit condition was the
  green suite + this summary. Everything is staged-ready. Say the word and I'll commit (and/or push).
- A stray **`BKT-Autofill-Bug-Screenshot.webp`** (prior session) and a **`supabase/functions/deno.lock`**
  (created by my `deno check`) are untracked and intentionally excluded.
- Your message "ignore the writingtools prompt please delete now" matched **nothing** in the repo, memory,
  or filenames — I deleted nothing. If you meant the stray screenshot above, confirm and I'll remove it.
