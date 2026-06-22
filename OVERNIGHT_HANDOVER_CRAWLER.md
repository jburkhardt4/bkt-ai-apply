# 🌙 Overnight Autonomous Run — ATS Crawler & Indexing Platform

**Run date:** 2026-06-22 (overnight) · **Branch:** `job-search-indexing-platform` · **PR:** [#29](https://github.com/jburkhardt4/bkt-ai-apply/pull/29) · **Project:** `rmoyuwesfljuygvpdolf`

All 5 authorized tasks completed. Everything is committed/pushed and the crawler is **live in production** (deployed + scheduled + populated with real data).

---

## ✅ Done & shipped

### 1. The 3 follow-up Codex review comments — fixed, verified, pushed (`7b53084`)

- **Circuit breaker** (`enqueue_due_crawl_jobs`): now skips `blocked` boards (manual reactivation) and backs off failing boards (15 min × `consecutive_failures`, capped at 8). **Verified live** — a blocked board was skipped while a healthy board enqueued. Re-applied to the hosted DB.
- **Harvest company labels** (`crawler-discover`): harvest now carries the job's `company_id` + `display_name` onto the board, so `job_postings.company_name` populates for company-weighted FTS.
- **Empty-enumeration warning** (`crawler-worker`): a full crawl returning 0 postings now logs a warning and (still) skips close-missing — keeps the transient-empty mass-closure guard, makes the skip auditable.
- Replied inline on all 3 Codex threads.

### 2. Edge functions DEPLOYED + SCHEDULED (gate override used, as authorized)

- `crawler-worker` and `crawler-discover` deployed via Supabase CLI (`--no-verify-jwt`, bundled from disk).
- **pg_cron active:** `crawler-discover-6h` (`0 */6 * * *`) + `crawler-worker-10m` (`*/10 * * * *`), mirroring the gmail-sync `net.http_post` pattern.
- **Smoke-tested end-to-end against real ATS APIs:** discover seeded 4 boards + enqueued 4 jobs; worker crawled and **ingested 288 real postings** (techholding 19, monsterenergy 185, directive 78, swans 6), all `ok`, zero errors. FTS verified on real data (85 "engineer", 217 "manager", 99 remote).

### 3. Real boards seeded — verified, pushed (`15da517`)

- `seeds.ts` populated with 4 **live-verified** tokens (each confirmed returning real jobs before seeding): `techholding`, `monsterenergy` (Greenhouse); `directive`, `swans` (Ashby).
- ⚠️ **Did NOT use your "Slalom / Anthropic / Scale AI" examples** — the `jb-answer-library-seed` memory explicitly flags those URLs as **fabricated (404)**. I used your verified targets + a no-fabrication policy. Add more via `seeds.ts` (or the harvest step picks up boards already in `jobs.source_url`).

### 4. Schema tech debt resolved — pushed (`f058820`)

- Added `20260622000004_candidate_profiles_add_name_columns` (idempotent `ADD COLUMN IF NOT EXISTS first_name/last_name text NOT NULL DEFAULT ''`, matching the live shape). The columns existed in the DB with no backing migration — now DB, migration, and `db.types.ts` all agree.

### 5. Phase 5 projector — built, verified, pushed (`2f057c8`)

- RPCs `project_corpus_for_profile` + `project_corpus_all` (service-role): FTS-match a profile's `job_titles` (OR'd tsquery) against the corpus, filter by environment→remote_type + `min_salary`, insert top `ts_rank` matches into the owner's `jobs` as `source='corpus'` (deduped on `UNIQUE(source_url)`). `jobs` table + RLS untouched.
- Thin `corpus-projector` edge function wraps `project_corpus_all`.
- **Verified live:** your profile projected **15 relevant remote Salesforce / Sales-Ops consultant roles** (Directive + Swans) into your `jobs`; re-run inserted 0 (idempotent); empty profile inserted 0.
- 🐛 Caught + fixed a bug before it touched your data: tsquery OR is a single `|`, not `||` (previewed read-only first, fixed, re-applied).

**Validation across the run:** `pnpm validate` green every push (**799 tests / 92 files**), `deno check` clean on all edge functions.

---

## ⚠️ Blockers / decisions waiting on you

1. **CRON_SECRET is NOT set (intentional — it's project-wide).** The crawler crons run **fail-open**, consistent with the existing gmail-sync / prospector-cron crons (which also have no secret). Setting `CRON_SECRET` would **401 those existing crons** unless every cron header is updated in the same change. To activate the gate project-wide:
   ```bash
   SECRET=$(openssl rand -hex 32)
   supabase secrets set CRON_SECRET="$SECRET" --project-ref rmoyuwesfljuygvpdolf
   # then re-run cron.schedule for ALL crons (crawler-discover-6h, crawler-worker-10m,
   # gmail-sync-15m, prospector-cron-8am, prospector-cron-6pm) adding to each headers jsonb:
   #   'x-cron-secret', '<that SECRET>'
   ```
2. **`corpus-projector` is deployed-ready but NOT deployed/scheduled.** It writes into users' `jobs` tables, so I left the cron flip to you. To turn it on: `supabase functions deploy corpus-projector --no-verify-jwt --project-ref rmoyuwesfljuygvpdolf`, then `cron.schedule('corpus-projector-30m', '*/30 * * * *', ...)` (same net.http_post pattern).
3. **15 `source='corpus'` jobs are now in your `jobs` table** (the projector test). They're real & relevant (remote Salesforce roles). If unwanted: `DELETE FROM public.jobs WHERE source='corpus';`
4. **Blocked boards need manual reactivation** by design — `UPDATE ats_boards SET last_status='ok', consecutive_failures=0 WHERE board_token='…';`
5. **PR #29 CI:** the real **`CI` workflow (typecheck · lint · test) passes** on every commit (`success` on the latest), Vercel passes, e2e skips (no UI changes) — PR is **MERGEABLE**. ⚠️ A *separate* repo workflow, `agentic-pr-code-review-auto-resolve-comments.lock.yml`, reports **failure on every push** (empty job list = fails at startup; it also failed on unrelated commits). It is **not** a required check and does not block the PR — looks like a pre-existing CI-automation/permissions issue, untouched (I don't modify CI infra autonomously). Worth a look when you're back.
6. **New review comments:** my pushes will trigger fresh Codex/Copilot re-reviews. An hourly monitor is armed to catch + address new comments overnight (3-retry budget per the overnight authorization).

---

## 📋 Open follow-ups (not blockers — future phases)

- **Phase 4: Workday** (the next big item — prompt below).
- Projector refinements: location matching (currently env + salary + FTS only), keyword-boosted ranking, and a search UI over `job_postings`.
- `job_posting_snapshots` retention/prune policy (append-only growth).
- `jobs` → `UNIQUE(user_id, source_url)` if/when true multi-tenant projection is wanted (deferred; `jobs` untouched).
- robots.txt enforcement *if* discovery ever expands beyond documented APIs to sitemap/HTML crawling.

---

## 📌 Copy-paste prompt to start Phase 4 (Workday) tomorrow

```
Start Phase 4 of the ATS crawler: add Workday ingestion to the corpus, HTTP-only
(NO headless browser, NO anti-bot bypass — BR-032/033/034; blocked→skip).

Context: Phases 1–3 + Phase 5 projector are live on branch job-search-indexing-platform
(PR #29), deployed to project rmoyuwesfljuygvpdolf. The crawler-worker/discover edge
functions run on pg_cron and the corpus has ~288 real postings from Greenhouse/Lever/Ashby.
Workday was deliberately deferred (antibot_tier='high'); see ADR-015 + memory
ats-job-corpus-phase2-shipped.

Build:
1. A Workday adapter in supabase/functions/_shared/crawl/adapters/workday.ts that reads
   the documented public CXS JSON feed: POST https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
   body {appliedFacets:{}, limit:20, offset:N, searchText:""}, paginated, then GET
   .../job/{externalPath} for the description HTML. Honor the 10,000-result cap by
   facet-slicing; on any 403 / behavioral block return BlockedError (board→blocked, skip).
2. Extend buildListEndpoint + nextCursor + the adapter registry (isCrawlable) for Workday;
   board_token encodes "tenant|dc|site". Add a workday_detail crawl_jobs.job_type follow-up
   for the per-job description fetch.
3. Add vitest fixtures for the Workday list + detail parsers (mirror the GH/Lever/Ashby tests).
4. Live-verify 1–2 real Workday tenants before seeding; deploy + smoke-test; keep the
   partial-enumeration guard (never close-missing on a truncated/capped Workday crawl).

Validate (pnpm validate + deno check), commit to job-search-indexing-platform, push.
Do NOT provision Playwright/Browserbase. If Workday blocks the JSON feed, mark blocked
and document it — do not bypass.
```

---
*Generated by the overnight autonomous run. Session log + per-step verification evidence are in the conversation transcript.*
