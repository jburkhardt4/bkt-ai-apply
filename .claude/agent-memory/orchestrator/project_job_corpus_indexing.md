---
name: project-job-corpus-indexing
description: Shared ATS job-posting search & indexing engine (corpus + crawler) — ADR-014/015, 3 migrations + crawl layer + 2 edge fns shipped & validated 2026-06-22 (PR #29); edge deploy JB-gated.
metadata:
  type: project
---

A first-party crawler + searchable index that ingests job postings DIRECTLY from the public JSON APIs of Greenhouse, Lever, and Ashby (Workday deferred) into a SHARED, deduplicated corpus — distinct from the per-user SerpApi prospector feed ([[project-serpapi-integration]]). Shipped & `pnpm validate`-green 2026-06-22 on branch `job-search-indexing-platform` / PR #29.

**Why:** The user-scoped `jobs` table (global `UNIQUE(source_url)`) is structurally wrong for a crawler — one world-posting relevant to many users would collide or duplicate its description per user. The shared corpus is the searchable index; the per-user pipeline is fed later by a service-role projector.

**How to apply:**
- ADRs (read both before touching this subsystem): `docs/adr/014-shared-public-job-corpus.md` (the RLS exception — see the security note below) + `docs/adr/015-ats-crawler-and-indexing.md` (crawler / Postgres queue / native FTS).
- Tables (migrations `20260622000001..3`, ALREADY applied to hosted project `rmoyuwesfljuygvpdolf` via MCP — the files are the repo record, do NOT `supabase db push`): `ats_boards`, `job_posting_snapshots` (append-only), `job_postings` (canonical FTS index), `crawl_jobs` (queue), `crawl_host_buckets`.
- Code + RPC contracts: [[reference-crawl-layer]]. Edge functions follow [[project-edge-function-conventions]].
- **HARD INVARIANT (ADR-014 Decision 4): the corpus tables carry NO `user_id`/PII, ever.** Authenticated read-all + service-role writes is the APPROVED posture — Supabase-Security must NOT flag it as a BR-005 / data-isolation violation (cite ADR-014).
- Locked JB decisions: Postgres FTS + `pg_trgm` only, **NO pgvector** (no embedding model in ai-router; $75/mo AI cap). The user-scoped `jobs` table is **UNTOUCHED** (projector copies matches in with `source='corpus'`, `ON CONFLICT (source_url) DO NOTHING`; true multi-tenant projection would later need `jobs UNIQUE(user_id, source_url)`). Workday deferred to Phase 4 (HTTP CXS feed only, no headless; blocked→skip per BR-032/033/034).

**Status 2026-06-22:** Phases 1-3 shipped/validated; live RPC chain proven on the hosted DB then cleaned to zero residue. PENDING (all JB-gated): (1) edge deploy of `crawler-worker`/`crawler-discover` + pg_cron wiring; (2) real board seeds in `seeds.ts`; (3) Phase 5 projector (corpus→`jobs`) + search UI; (4) Phase 4 Workday.

Related: [[project-serpapi-integration]], [[project-edge-function-conventions]], [[reference-crawl-layer]], [[reference-validate-gate]].
