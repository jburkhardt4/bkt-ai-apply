# Business Rules — BKT AI-Apply

> **Append-only.** Confirmed invariants only. Owned by **Context-Keeper**;
> proposed by Business-Analyst and Supabase-Security. Never renumber or rewrite
> a confirmed rule — supersede it with a new BR and mark the old one
> `superseded_by`.
>
> Agents MUST cite the rule **ID** (e.g. `BR-008`), never a hardcoded literal.
> **Release-Gate** treats this file as its primary decision baseline; CLAUDE.md
> is the fallback when a rule is absent here.

## Status legend

- `confirmed` — in force.
- `superseded` — replaced; see `superseded_by`.

---

## Non-Negotiables (mirror of CLAUDE.md — never violate without an ADR)

### BR-001 — RLS always on

- statement: Row Level Security is enabled on every Supabase table. Never disable it.
- source: CLAUDE.md Non-Negotiables #1
- status: confirmed

### BR-002 — Single DB client

- statement: All database access goes through `src/lib/supabase.ts`. No raw fetch to the Supabase REST API.
- source: CLAUDE.md Non-Negotiables #2
- status: confirmed

### BR-003 — Auth boundary

- statement: Auth state lives only in `src/contexts/AuthContext.tsx`.
- source: CLAUDE.md Non-Negotiables #3
- status: confirmed
- note: file not yet present in the repo; Supabase-Security HOLDs (with the missing path) if a change targets auth state before it exists.

### BR-004 — Event sourcing

- statement: Every `applications.stage` change writes an `application_events` row. No exceptions.
- source: CLAUDE.md Non-Negotiables #4
- status: confirmed

### BR-005 — User scoping

- statement: Every query filters by `user_id`; no cross-user data leakage.
- source: CLAUDE.md Non-Negotiables #5
- status: confirmed

### BR-006 — Service-role key never client-side

- statement: `SUPABASE_SERVICE_ROLE_KEY` must never appear in the client bundle.
- source: PROJECT_INSTRUCTIONS Non-Negotiables #6
- status: confirmed

---

## Domain Rules

### BR-007 — Stage transitions are one-directional

- statement: Pipeline stage transitions move forward only, except `ghosted → applied`.
- source: PROJECT_INSTRUCTIONS Key Domain Rules
- status: confirmed

### BR-008 — Auto-apply match-score threshold

- statement: Auto-apply may submit an application only when `match_score ≥ 80`. Below 80, do not auto-submit.
- value: `80` (integer, 0–100 scale)
- applies_to: the auto-apply submission gate (`masterProfile.autoApplyThreshold`), Critical-Path sign-off, Release-Gate.
- rationale: resolves a three-way conflict (60 / 75 / 80). 80 is JB's most recent explicit decision (commit `4721e65`, 2026-06-03, "improved application accuracy") and the safer bar for an outward-facing automated submission. See ADR-001.
- supersedes_values: 75 (`masterProfile.ts`, `critical-path`, `wave3`), 60 (`prd.md`) — all reconciled to 80.
- source: ADR-001
- status: confirmed

### BR-009 — Low-confidence email events are not auto-actioned

- statement: Email events with classification confidence `< 0.70` are stored but NOT auto-actioned.
- source: PROJECT_INSTRUCTIONS Key Domain Rules
- status: confirmed

### BR-010 — Documents immutable after link

- statement: A document is immutable once linked to an application; create a new version instead of editing.
- source: PROJECT_INSTRUCTIONS Key Domain Rules
- status: confirmed

### BR-011 — `application_events` are permanent

- statement: `application_events` rows are never deleted — permanent audit trail.
- source: CLAUDE.md / PROJECT_INSTRUCTIONS
- status: confirmed

### BR-012 — Rejection does not overwrite an offer

- statement: A rejection email does not overwrite an existing `offer` stage; manual confirmation is required.
- source: PROJECT_INSTRUCTIONS Key Domain Rules
- status: confirmed
