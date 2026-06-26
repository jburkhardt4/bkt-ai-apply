# ADR-019: Shared Public Job Corpus & Its RLS Posture

- **Status:** Accepted
- **Date:** 2026-06-22
- **Relates:** CLAUDE.md non-negotiable #5 (user scoping), ADR-013 (headless prep / ATS read APIs), ADR-007 (server-side match scoring), ADR-015 (crawler + indexing), migrations `20260622000001_create_job_corpus`, `20260603000004_create_jobs`, `20260603000003_create_companies`
- **Decided by:** JB, 2026-06-22

## Context

Job discovery today runs through `prospector-cron`, which queries the SerpApi Google Jobs API and
writes results into the **user-scoped `jobs` table** (`user_id NOT NULL`, RLS own-row, a global
`UNIQUE(source_url)`). That is a personalized feed, not an index: postings are mediated by a search
engine, deduped per URL, and there is no cross-company corpus and no full-text search.

We are adding a first-party crawler that pulls listings **directly** from the public JSON APIs of
Greenhouse, Lever, and Ashby (Workday deferred — ADR-015). The crawler's natural unit is "one
posting in the world" — a **shared** concept. A single board posting relevant to many users must
not be duplicated per user, nor collide on the per-user table's global `UNIQUE(source_url)`. We
therefore need a shared, deduplicated, searchable corpus, which has no natural `user_id`.

CLAUDE.md non-negotiable #5 requires every query to filter by `user_id` with no cross-user leakage.
A shared corpus is a deliberate, scoped departure from that rule — which is exactly why it needs
this ADR.

## Decision

**1. Three new SHARED, not-user-scoped tables** (`20260622000001_create_job_corpus`):
- `ats_boards` — crawl seed / board registry + incremental-sync state.
- `job_posting_snapshots` — append-only raw fetch payloads (audit + reparse + drift).
- `job_postings` — normalized, deduplicated canonical postings; the searchable index.

None carries a `user_id`. Canonical identity is `UNIQUE(ats_family, board_id, external_job_id)`.

**2. RLS stays ENABLED; the posture is authenticated-read-all + service-role-write.** Each table
enables RLS with a single `SELECT TO authenticated USING (true)` policy and **no
INSERT/UPDATE/DELETE policy**. Authenticated users read the whole corpus; only the service role
(which bypasses RLS) writes — the same trust boundary the submission worker and prep cron already
use. RLS is never disabled (non-negotiable #1 intact).

**3. The exception is justified because the data is public.** `job_postings` holds only job-posting
content already published on public ATS boards — no user PII. The precedent is the existing
**shared `companies` table** (authenticated-read, not user-scoped). The scoped carve-out from
non-negotiable #5 is: *tables that hold only public, non-user data may be authenticated-read-all,
provided no user-identifying column is ever added to them.*

**4. Hard invariant: no user data in the corpus.** No `user_id`, no per-user state, no PII columns
are ever added to `ats_boards` / `job_posting_snapshots` / `job_postings`. Per-user concerns
(scores, saved state, applications) stay in the existing user-scoped tables. Any future need to
associate a user with a posting is modeled in a separate user-scoped table that references
`job_postings.id`.

**5. Bridge to per-user via projection (service-role).** The user-scoped `jobs` table and its RLS
are UNCHANGED. A service-role projector reads each active `prospecting_profiles` row, queries
`job_postings` (FTS + filters), and inserts matched rows into that user's `jobs` with
`source='corpus'` and `user_id = profile.user_id`, satisfying the `jobs` RLS `WITH CHECK`. The
existing global `UNIQUE(source_url)` on `jobs` is kept; the projector dedups via
`ON CONFLICT (source_url) DO NOTHING` (correct for the current single-tenant reality).

## Consequences

- The corpus is queryable by any authenticated user — intended (shared search). Because rows are
  public postings, this is not a leak.
- True multi-tenant projection (two users each owning their own copy of the same posting) would
  require changing `jobs` to `UNIQUE(user_id, source_url)`. Deferred; flagged as a prerequisite, not
  done here (JB: keep `jobs` untouched, 2026-06-22).
- `get_advisors(security)` reports no RLS-disabled findings; an informational "RLS enabled, no
  policy" note on the write paths is expected and intended (writes are service-role-only).
- Append-only `job_posting_snapshots` grows unbounded; a service-role retention prune (keep latest
  N per posting) is a follow-up (ADR-015).
- Reviewers must guard the invariant in Decision 4: a PR adding a `user_id` to any corpus table is
  rejected or must re-scope the table.
