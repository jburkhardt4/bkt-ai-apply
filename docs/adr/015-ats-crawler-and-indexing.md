# ADR-015: ATS Crawler, Postgres Queue & Native Full-Text Indexing

- **Status:** Accepted
- **Date:** 2026-06-22
- **Relates:** ADR-014 (shared corpus), ADR-013 (`_shared/prep` ATS adapters), ADR-006 (submission worker / pg_cron pattern), BR-032/033/034 (no anti-scraping bypass), migrations `20260622000001_create_job_corpus`, `20260622000002_create_crawl_queue`
- **Decided by:** JB, 2026-06-22

## Context

ADR-014 establishes the shared corpus. This ADR fixes how it is filled and searched: the crawler
architecture, the task queue, rate-limiting/politeness, the storage/indexing engine, and the ATS
scope for v1.

The `_shared/prep` layer already resolves single-posting read endpoints (`buildReadEndpoint.ts`)
and detects ATS family + anti-bot tier (`atsFamily.ts`). What's missing is the board-level **list**
fetch and an indexing layer. The stack is 100% Supabase (Postgres + Deno Edge Functions);
`gmail-sync` and `submission-worker` already establish the pg_cron → `net.http_post` → Edge →
service-role-write pattern.

## Decision

**1. Crawler = two pg_cron-driven Edge Functions over a Postgres queue.** `crawler-discover`
(daily) refreshes `ats_boards` and enqueues `list_sync` work; `crawler-worker` (~5–10 min) claims
queued work, fetches/parses/normalizes/upserts, and closes missing postings. No external
queue/infra — the queue is `crawl_jobs` (migration `20260622000002`), claimed with
`FOR UPDATE SKIP LOCKED` via the service-role-only `claim_crawl_jobs` RPC, mirroring
`claim_submission`.

**2. HTTP-only for v1: Greenhouse, Lever, Ashby. Workday deferred (Phase 4).** All three expose
documented, auth-free JSON list APIs fetched with standard Deno `fetch` (no browser). Workday is
anti-bot-defended (`antibot_tier='high'`); its documented CXS JSON feed is HTTP-capable but
deferred until the core index is proven. Until then Workday postings reach users via the existing
prospector `site:myworkdayjobs.com` pass and the in-session extension.

**3. No anti-scraping bypass — ever (BR-032/033/034).** On any CAPTCHA / auth-wall / behavioral
block the adapter returns `blocked`; the board is marked `last_status='blocked'`, skipped, and JB
is alerted. We never escalate to a headless browser to defeat a defense. (Asymmetry by design: the
polite read-crawler lives in the backend; aggressive, human-owned apply automation lives only in
the user's extension session.)

**4. Politeness.** Per-host token bucket (`crawl_host_buckets`) consumed before each fetch (out of
tokens → reschedule, never block); identifying `User-Agent` + contact; honor `Retry-After`;
conditional GET (`If-None-Match`) → 304 skip; `robots.txt` fetched + enforced for any non-API
discovery crawl. Documented product APIs (boards-api.greenhouse.io, api.lever.co, posting-api) are
polled directly. Exponential backoff on 429 + a `consecutive_failures` circuit breaker.

**5. Storage/indexing = Postgres-native FTS + pg_trgm. No pgvector, no external cluster (this
phase).** A `tsvector` generated column (weighted title^A / company^B / dept·team^C /
description^D) with a GIN index; `pg_trgm` GIN on title + company for fuzzy matching; partial
btrees on `posted_at` / `remote_type` / `department` (`WHERE closed_at IS NULL`). An external
search cluster (OpenSearch/Elasticsearch) is rejected — it adds a second source of truth and a sync
pipeline against the single-DB-client principle. **pgvector/semantic search is explicitly out of
scope:** `src/lib/ai-router.ts` has no embedding model today and the AI budget is capped ($75/mo);
FTS recall feeds the existing Sonnet `match_scoring` route for final ranking, so semantic recall is
a future ADR + budget item, not a blocker.

**6. Dedup & incremental sync.** `content_hash = sha256(canonical subset)` drives a no-churn upsert
(`ON CONFLICT (ats_family, board_id, external_job_id) DO UPDATE ... WHERE content_hash IS DISTINCT
FROM EXCLUDED.content_hash`). Closed-posting detection is a per-board set difference
(`closed_at = now()` for IDs absent from a full successful enumeration), run **only** when
`last_status='ok'` — never on a partial/blocked fetch.

## Components

- `supabase/functions/_shared/crawl/` — `listEndpoint.ts` (board-level twin of
  `buildReadEndpoint.ts`), `normalize.ts` (unified mapping, remote-type heuristic, salary parse —
  `content_hash` is computed in SQL by `upsert_job_postings`, not here),
  `adapters/{greenhouse,lever,ashby}.ts` (Workday deferred). Pure, vitest-tested like `_shared/prep`.
  Per-host politeness is the SQL `consume_crawl_token` RPC, not a TS module.
- `supabase/functions/crawler-discover/`, `supabase/functions/crawler-worker/` — Deno Edge
  Functions, pg_cron-driven, service-role writes.
- Migrations `20260622000001_create_job_corpus` (corpus + FTS/trgm indexes) and
  `20260622000002_create_crawl_queue` (`crawl_jobs`, `crawl_host_buckets`, `claim_crawl_jobs`,
  `requeue_stale_crawl_jobs`).
- Projector (ADR-014 Decision 5) — service-role step inserting `source='corpus'` rows into per-user
  `jobs`.

## Alternatives considered

- **External OpenSearch/Elasticsearch** — rejected; dual source of truth + sync/ops surface outside
  Supabase for a modest corpus.
- **pgvector semantic search now** — deferred; no embedding model in the router, AI budget capped;
  FTS+trgm + the existing Sonnet scorer cover v1.
- **External queue (SQS/QStash/Redis)** — rejected; the Postgres `FOR UPDATE SKIP LOCKED` queue
  already used by the submission worker is sufficient and keeps one datastore.
- **Headless Workday via Playwright/Browserbase** — rejected this phase; anti-bot/legal risk
  (ADR-013's Workday stance) and no headless infra. Workday stays on the extension-session path
  until the core index is proven.

## Consequences

- Re-verify each ATS list API before trusting parsers; pin with fixtures (same live-tune caveat as
  `_shared/prep`).
- Edge functions escape `pnpm validate` (tsc -b skips `supabase/functions`); rely on
  `_shared/crawl/*.test.ts` vitest + manual bundle-verify (per remote-workflow notes). Edge deploy
  stays JB-gated via MCP.
- Corpus tables (ADR-014) are authenticated-read-all; the crawler writes as service role only.
- Workday coverage is intentionally lower in v1; revisited in Phase 4.
