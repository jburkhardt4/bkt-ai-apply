---
name: reference-crawl-layer
description: Where the ATS crawl code lives in bkt-ai-apply and the service-role ingest RPC contracts.
metadata:
  type: reference
---

ATS crawler subsystem (ADR-015; context in [[project-job-corpus-indexing]]).

**Pure, vitest-tested layer** — `supabase/functions/_shared/crawl/`:
- `types.ts` (UnifiedPosting / BoardRef / ListRequest / Cursor), `normalize.ts` (stripHtml, decodeEntities, classifyRemoteType, parseSalaryFromText, buildPosting), `listEndpoint.ts` (board-level list-URL builder — the deliberate twin of `_shared/prep/buildReadEndpoint.ts`; Lever pagination via `nextCursor`), `discovery.ts` (`extractBoardRef`, reuses `_shared/prep/atsFamily.detectAtsFamily`), `adapters/{greenhouse,lever,ashby}.ts` + `index.ts` (`parseList` / `isCrawlable`), `seeds.ts` (EMPTY by design — no fabricated tokens; discover harvests real tokens from `jobs.source_url`).

**Edge functions** (Deno; mirror `submission-worker`, see [[project-edge-function-conventions]]): `crawler-worker/index.ts` (claim → rate-limit → paginated fetch → parseList → upsert → close-missing → board state) and `crawler-discover/index.ts` (seed upsert + harvest + enqueue).

**Service-role-only RPCs** (migrations `20260622000002`/`20260622000003`; mirror the `claim_submission` grant pattern — SECURITY DEFINER, `REVOKE … FROM PUBLIC,anon,authenticated; GRANT … TO service_role`):
- `claim_crawl_jobs(p_batch, p_lease)` → SETOF crawl_jobs (FOR UPDATE SKIP LOCKED, leases them).
- `consume_crawl_token(p_host, p_rps, p_burst)` → boolean (per-host token bucket).
- `upsert_job_postings(p_board_id, p_rows jsonb)` → `{inserted,updated,unchanged,skipped}` — no-churn; `content_hash` computed in SQL via `extensions.digest`; snapshots only on insert/change.
- `close_missing_job_postings(p_board_id, p_seen text[])` → int — call ONLY after a full `ok` enumeration (never on 304/partial/blocked).
- `enqueue_due_crawl_jobs(p_stale_after, p_max)` → int.
- `requeue_stale_crawl_jobs(p_grace)` → int (self-heal expired leases).

**Gotchas:** edge fns escape `tsc -b`/validate ([[reference-validate-gate]]) — verify with `deno check`. Search the corpus with `search_tsv @@ websearch_to_tsquery('english', …) AND closed_at IS NULL`; fuzzy company/title via `pg_trgm`.
