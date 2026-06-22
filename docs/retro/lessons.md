# Lessons Register — BKT AI-Apply

> **Append-only.** One entry per confirmed failure, HOLD, BLOCK, escalation, or
> notable retry. Newest at top. Confirmed by **Context-Keeper only** — agents
> emit `lesson_candidate` drafts; they are not lessons until confirmed here.
> Never delete, reorder, or rewrite a confirmed lesson.
>
> A RESOLVED failure is a confirmed outcome — record it. Only unresolved,
> in-flight, or speculative items are excluded.
>
> When the same `root_cause`/`tags` recurs ≥ 2×, Context-Keeper promotes the
> lesson to a Business Rule (BR) or ADR and links it in `promoted_to`.

## Entry template

```text
## LSN-NNN — <short title>
- timestamp:      # ISO 8601, e.g. 2026-06-03T00:00:00Z
- task_id:
- trigger:        # what failed (gate, check, command)
- root_cause:     # why, 1-2 sentences, no blame
- prevention:     # the rule/check/step that would have caught it earlier
- tags: []        # rls|auth|routing|stage-events|threshold|deploy|types|process|...
- status:         # confirmed | superseded
- promoted_to:    # BR-xxx or ADR-xxx, if recurring
```

> Entries confirmed in the same session share a timestamp; that is expected.

---

## LSN-007 — edge functions escape `pnpm validate`; verify with `deno check`

- timestamp: 2026-06-22T00:00:00Z
- task_id: CRAWLER-PHASE3-DEPLOY
- trigger: New `_shared/crawl/*` modules + the `crawler-*` / `corpus-projector` edge functions passed `pnpm validate` green, but `validate` never typechecks them.
- root_cause: `pnpm validate`'s `tsc -b` skips `supabase/functions` (a separate Deno project with its own `deno.json` import map + `Deno.*` globals that Node/tsc can't resolve), so a broken Deno edge function ships green.
- prevention: Run `deno check supabase/functions/<fn>/index.ts` (it resolves the bare `@supabase/supabase-js` import-map specifier) before deploying or pushing ANY edge function — tsc + eslint alone miss Deno errors. Keep reusable logic in `_shared/**` with explicit `./x.ts` imports and no `Deno.*`/bare-specifier imports so it stays vitest-testable from Node; never import an edge entrypoint into a `*.test.ts`.
- tags: [deploy, types, edge, testing, process]
- status: confirmed
- promoted_to:

## LSN-006 — a migration using a pgcrypto/extension function must declare the extension

- timestamp: 2026-06-22T00:00:00Z
- task_id: CRAWLER-PHASE2-SCHEMA
- trigger: `20260622000003_crawl_ingest_rpcs` computed `content_hash` via `extensions.digest(...)` (pgcrypto) without `CREATE EXTENSION`; a PR reviewer flagged it.
- root_cause: It only worked because pgcrypto is a Supabase-default extension on the hosted DB; the migration was not self-contained for a fresh rebuild, breaking the "migrations are the source-of-truth DB record" convention.
- prevention: Any migration calling a pgcrypto function (`digest`, `gen_random_bytes`, …), pg_trgm, or any non-built-in extension must declare `CREATE EXTENSION IF NOT EXISTS <ext> WITH SCHEMA extensions;` at the top. Never rely on the hosted DB's pre-installed extensions for the repo record.
- tags: [db, migration, extensions, process]
- status: confirmed
- promoted_to:

## LSN-005 — `CRON_SECRET` is project-wide + fail-open; update all cron headers BEFORE setting the env secret

- timestamp: 2026-06-22T00:00:00Z
- task_id: CRAWLER-PHASE3-DEPLOY
- trigger: Enabling `CRON_SECRET` to lock the crawler's `--no-verify-jwt` endpoints.
- root_cause: `CRON_SECRET` is a single PROJECT-WIDE Edge Function env var read by every function's `_shared/cron-auth.ts`. Unset → functions fail-open (warn + allow); once set → every function requires the `x-cron-secret` header, so any scheduled cron not sending it (all of them, by default) starts returning 401.
- prevention: Activate in this order — (1) re-run `cron.schedule` for ALL crons (crawler + gmail-sync + prospector, not just the new ones) adding `x-cron-secret` with one shared value (harmless while the env is still unset), (2) `supabase secrets set CRON_SECRET=<value>` LAST, (3) verify 200-with / 401-without. Never set the env before the cron headers exist. The value sits in `cron.job.command` plaintext (the `net.http_post` header tradeoff); rotate by repeating with a fresh value.
- tags: [deploy, cron, auth, edge, process]
- status: confirmed
- promoted_to:

## LSN-004 — multi-write stage transitions must be atomic via RPC

- timestamp: 2026-06-05T22:20:00Z
- task_id: PHASE1-PIPELINE-CORE-RETRY
- trigger: Qa-Uat D-001 HOLD — two sequential `applications` UPDATE + `application_events` INSERT could leave audit event missing on partial failure (BR-002 risk)
- root_cause: Supabase JS has no client-side transaction API; two independent round-trips can diverge on network/server error between them
- prevention: All stage transitions must go through `public.transition_stage` RPC, which executes both writes inside a single PostgreSQL transaction. `applicationService.ts` must never make separate update+insert calls for stage changes.
- tags: [stage-events, rls, process]
- status: confirmed
- promoted_to: LSN-004 cited in BR-002, architecture.md §5, docs/prd.md §27

## LSN-003 — e2e tests required per page; @playwright/test must be explicit devDependency

- timestamp: 2026-06-05T22:20:00Z
- task_id: PHASE1-PIPELINE-CORE-RETRY
- trigger: Qa-Uat D-002 HOLD — `pnpm test:e2e` exited 1 ("No tests found") because no e2e test files existed and `@playwright/test` was not installed (only `playwright` was in devDependencies)
- root_cause: `playwright` (browser automation) and `@playwright/test` (test runner) are separate packages; the test runner was never installed. No e2e test files were created for the initial pipeline page implementation.
- prevention: Feature-Dev must create at least one `e2e/*.spec.ts` file for every new page/route. `@playwright/test` must be listed explicitly in devDependencies alongside `playwright`. Vitest must exclude `e2e/**` to prevent spec files from being picked up by both runners.
- tags: [process, ci]
- status: confirmed
- promoted_to:

## LSN-002 — `pnpm validate` was unsatisfiable

- timestamp: 2026-06-03T00:00:00Z
- task_id: HARDENING-001
- trigger: Qa-Uat "Required Checks" (`pnpm validate`, `pnpm test:e2e`) — command not found.
- root_cause: `package.json` defined only `dev/build/lint/preview`; the validation scripts every agent depends on were never wired, so "validate before done" could not run.
- prevention: Qa-Uat now HOLDs (never passes) when a required script is undefined, citing exact remediation. Scripts `typecheck`/`test`/`test:e2e`/`validate` were added.
- tags: [process, types, ci]
- status: confirmed
- promoted_to:

## LSN-001 — Auto-apply threshold had three conflicting values

- timestamp: 2026-06-03T00:00:00Z
- task_id: HARDENING-001
- trigger: the submission gate was specified as 80 (PROJECT_INSTRUCTIONS), 75 (masterProfile.ts, critical-path, wave3), and 60 (prd.md) at the same time.
- root_cause: the threshold was hardcoded as a literal in multiple places with no single source of truth, so independent edits drifted apart.
- prevention: one rule (BR-008 = 80); every agent and file cites the BR ID, never a literal. Business-Analyst now flags contradictory invariants in `scope_conflicts`.
- tags: [threshold, process]
- status: confirmed
- promoted_to: BR-008, ADR-001
