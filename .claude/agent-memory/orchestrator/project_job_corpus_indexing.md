---
name: project-job-corpus-indexing
description: Shared ATS job-posting search & indexing engine (corpus + crawler) — ADR-019/015; SHIPPED to main 2026-06-22 (PR #29 / c9d9213), deployed + on pg_cron, CRON_SECRET active, projector live. Structural lessons LSN-005..007.
metadata:
  type: project
---

A first-party crawler + searchable index that ingests job postings DIRECTLY from the public JSON APIs of Greenhouse, Lever, and Ashby (Workday deferred) into a SHARED, deduplicated corpus — distinct from the per-user SerpApi prospector feed ([[project-serpapi-integration]]). Shipped & `pnpm validate`-green 2026-06-22 on branch `job-search-indexing-platform` / PR #29.

**Why:** The user-scoped `jobs` table (global `UNIQUE(source_url)`) is structurally wrong for a crawler — one world-posting relevant to many users would collide or duplicate its description per user. The shared corpus is the searchable index; the per-user pipeline is fed later by a service-role projector.

**How to apply:**
- ADRs (read both before touching this subsystem): `docs/adr/019-shared-public-job-corpus.md` (the RLS exception — see the security note below) + `docs/adr/015-ats-crawler-and-indexing.md` (crawler / Postgres queue / native FTS).
- Tables (migrations `20260622000001..3`, ALREADY applied to hosted project `rmoyuwesfljuygvpdolf` via MCP — the files are the repo record, do NOT `supabase db push`): `ats_boards`, `job_posting_snapshots` (append-only), `job_postings` (canonical FTS index), `crawl_jobs` (queue), `crawl_host_buckets`.
- Code + RPC contracts: [[reference-crawl-layer]]. Edge functions follow [[project-edge-function-conventions]].
- **HARD INVARIANT (ADR-019 Decision 4): the corpus tables carry NO `user_id`/PII, ever.** Authenticated read-all + service-role writes is the APPROVED posture — Supabase-Security must NOT flag it as a BR-005 / data-isolation violation (cite ADR-019).
- Locked JB decisions: Postgres FTS + `pg_trgm` only, **NO pgvector** (no embedding model in ai-router; $75/mo AI cap). The user-scoped `jobs` table is **UNTOUCHED** (projector copies matches in with `source='corpus'`, `ON CONFLICT (source_url) DO NOTHING`; true multi-tenant projection would later need `jobs UNIQUE(user_id, source_url)`). Workday deferred to Phase 4 (HTTP CXS feed only, no headless; blocked→skip per BR-032/033/034).

**Status 2026-06-22 — SHIPPED TO MAIN & LIVE:** Merged via PR #29 (rebase, commit `c9d9213`). Deployed to `rmoyuwesfljuygvpdolf`: `crawler-worker` + `crawler-discover` on pg_cron (`*/10 * * * *` / `0 */6 * * *`); `corpus-projector` deployed but UNSCHEDULED (writes users' `jobs` — cron flip JB-gated). 4 boards seeded + crawling (~287 live postings, 3 auto-closed → close-missing proven); FTS + projector verified (15 `source='corpus'` jobs, idempotent). **`CRON_SECRET` activated project-wide** across all 5 crons (crawler×2 + gmail-sync + prospector×2) via the update-all-headers-then-set-env order, verified 200/401 — see LSN-005. Structural lessons recorded: **LSN-005** (CRON_SECRET project-wide + fail-open activation order), **LSN-006** (pgcrypto/extension must be declared in migrations), **LSN-007** (edge fns escape `pnpm validate` → use `deno check`). REMAINING: Phase 4 Workday; projector cron flip + a search UI; `job_posting_snapshots` retention; `jobs UNIQUE(user_id,source_url)` for multi-tenant.

> ⚠️ Context-Keeper note: invoked to record these lessons it HALLUCINATED a full summary (claimed it appended LSN-012/013/014 + business-rule edits) while making `tool_uses: 0` — it wrote nothing. LSN-005..007 were appended directly instead. Always verify Context-Keeper's actual file edits; never trust its summary alone.

Related: [[project-serpapi-integration]], [[project-edge-function-conventions]], [[reference-crawl-layer]], [[reference-validate-gate]].
