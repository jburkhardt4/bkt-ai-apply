# 🌙 Overnight Run — ATS Crawler

**Date:** 2026-06-22 (overnight)
**Branch:** `job-search-indexing-platform`
**PR:** [#29](https://github.com/jburkhardt4/bkt-ai-apply/pull/29)
**Project:** `rmoyuwesfljuygvpdolf`

All 5 authorized tasks are done.
Everything is committed/pushed and the
crawler is **live in production**
(deployed + scheduled + real data).

---

## ✅ Done & shipped

### 1 · Three Codex fixes (`7b53084`)

- **Circuit breaker**
  (`enqueue_due_crawl_jobs`): skips
  `blocked` boards + backs off failing
  ones (15 min × failures, cap 8).
  Verified live. Re-applied to the DB.
- **Harvest company labels**
  (`crawler-discover`): harvested boards
  now carry `company_id` +
  `display_name`, so
  `job_postings.company_name` feeds the
  company-weighted FTS.
- **Empty-enum warning**
  (`crawler-worker`): a 0-posting crawl
  logs a warning + still skips
  close-missing (no mass-closure).
- Replied inline on all 3 threads.

### 2 · Deploy + schedule (gate override)

- `crawler-worker` + `crawler-discover`
  deployed (CLI, `--no-verify-jwt`).
- **pg_cron active:**
  `crawler-discover-6h` (`0 */6 * * *`)
  and `crawler-worker-10m`
  (`*/10 * * * *`).
- **Smoke-tested on real APIs —
  ingested 288 postings:**
  techholding 19, monsterenergy 185,
  directive 78, swans 6. All `ok`, zero
  errors. FTS works (85 "engineer",
  217 "manager", 99 remote).

### 3 · Real board seeds (`15da517`)

- 4 **live-verified** tokens:
  `techholding`, `monsterenergy` (GH);
  `directive`, `swans` (Ashby).
- ⚠️ Did NOT use your
  "Slalom / Anthropic / Scale AI"
  examples — the `jb-answer-library-seed`
  memory flags those as
  **fabricated (404)**. Used verified
  targets only.

### 4 · Schema debt (`f058820`)

- Added the backing migration
  `20260622000004` for
  `candidate_profiles.first_name` /
  `last_name` (idempotent
  `ADD COLUMN IF NOT EXISTS`). DB,
  migration, and types now agree.

### 5 · Phase 5 projector (`2f057c8`)

- RPCs `project_corpus_for_profile` +
  `project_corpus_all`: FTS-match a
  profile's titles vs the corpus, filter
  by env + salary, insert top matches
  into `jobs` as `source='corpus'`
  (dedup on `source_url`). `jobs` + RLS
  untouched.
- Thin `corpus-projector` edge fn wraps
  it.
- **Verified live:** your profile got
  **15 remote Salesforce / Sales-Ops
  roles** (Directive + Swans); re-run
  inserted 0 (idempotent).
- 🐛 Caught + fixed a tsquery bug
  (`|`, not `||`) before it touched your
  data.

**Validation:** `pnpm validate` green
every push (**799 tests**); `deno check`
clean.

---

## ⚠️ Waiting on you

### 1 · CRON_SECRET (not set)

It's project-wide. Crawler crons run
fail-open, like the existing gmail /
prospector crons. Setting it would 401
those crons unless every header updates
together. To activate:

```bash
SECRET=$(openssl rand -hex 32)
supabase secrets set \
  CRON_SECRET="$SECRET" \
  --project-ref rmoyuwesfljuygvpdolf
# then add to EVERY cron's headers:
#   'x-cron-secret', '<SECRET>'
# crons: crawler-discover-6h,
#   crawler-worker-10m, gmail-sync-15m,
#   prospector-cron-8am / -6pm
```

### 2 · corpus-projector (ready, off)

Deployed-ready but NOT scheduled — it
writes to users' `jobs`, so the cron
flip is yours:

```bash
supabase functions deploy \
  corpus-projector --no-verify-jwt \
  --project-ref rmoyuwesfljuygvpdolf
# then cron.schedule(
#   'corpus-projector-30m',
#   '*/30 * * * *', ...)
```

### 3 · 15 corpus jobs in your table

The projector test inserted 15 real,
relevant `source='corpus'` jobs. Remove
if unwanted:

```sql
DELETE FROM public.jobs
 WHERE source = 'corpus';
```

### 4 · Blocked boards

Need manual reactivation by design:

```sql
UPDATE ats_boards
   SET last_status = 'ok',
       consecutive_failures = 0
 WHERE board_token = '…';
```

### 5 · CI status

Real `CI` (typecheck · lint · test)
**passes**, Vercel passes, PR is
**MERGEABLE**. ⚠️ A *separate* workflow,
`agentic-pr-code-review-auto-resolve-comments`,
fails on every push (pre-existing infra,
not a required check, not my code).

### 6 · New reviews

An hourly monitor is armed to catch +
address new Codex/Copilot rounds
overnight.

---

## 📋 Follow-ups (future)

- **Phase 4: Workday** (prompt below).
- Projector: location matching,
  keyword-boosted ranking, a search UI.
- `job_posting_snapshots` retention /
  prune (append-only growth).
- `jobs` →
  `UNIQUE(user_id, source_url)` for
  multi-tenant (deferred).
- robots.txt if discovery expands
  beyond the documented APIs.

---

## 📌 Phase 4 (Workday) — paste tomorrow

```
Start Phase 4 of the ATS crawler: add
Workday ingestion, HTTP-only (NO
headless browser, NO anti-bot bypass —
BR-032/033/034; blocked -> skip).

Context: Phases 1-3 + the Phase 5
projector are live on branch
job-search-indexing-platform (PR #29),
deployed to rmoyuwesfljuygvpdolf. The
crawler runs on pg_cron; the corpus has
~288 real postings (GH/Lever/Ashby).
Workday was deferred
(antibot_tier='high'); see ADR-015 +
memory ats-job-corpus-phase2-shipped.

Build:
1. A Workday adapter at
   _shared/crawl/adapters/workday.ts
   reading the public CXS JSON feed:
   POST .../wday/cxs/{tenant}/{site}/jobs
   on {tenant}.{dc}.myworkdayjobs.com,
   body {appliedFacets:{}, limit:20,
   offset:N, searchText:""}, paginated;
   then GET .../job/{externalPath} for
   the description HTML. Honor the 10k
   cap via facet-slicing; on a 403 /
   behavioral block return BlockedError
   (board -> blocked, skip).
2. Extend buildListEndpoint + nextCursor
   + the registry (isCrawlable) for
   Workday; board_token encodes
   "tenant|dc|site". Add a
   workday_detail crawl_jobs.job_type
   for the per-job description fetch.
3. Add vitest fixtures for the Workday
   list + detail parsers (mirror the
   GH/Lever/Ashby tests).
4. Live-verify 1-2 real Workday tenants
   before seeding; deploy + smoke-test;
   keep the partial-enumeration guard
   (never close-missing on a truncated
   or capped Workday crawl).

Validate (pnpm validate + deno check),
commit to job-search-indexing-platform,
push. Do NOT provision
Playwright/Browserbase. If Workday
blocks the JSON feed, mark blocked +
document — do not bypass.
```

---
*Overnight autonomous run. Per-step
evidence is in the session transcript.*
