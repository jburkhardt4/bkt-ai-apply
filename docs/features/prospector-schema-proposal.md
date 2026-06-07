# Prospector Schema Proposal

**feature:** F-017 — Automated Job Prospector
**status:** PROPOSAL — not applied; no migration has been run
**proposal_date:** 2026-06-07
**authored_by:** Supabase-Security Agent (dispatched by Orchestrator WO-20260607-automated-job-prospector)
**depends_on:** docs/prd.md §23b, docs/domain/business-rules.md BR-100 through BR-107, docs/domain/auth.md, docs/requirements/06-security-compliance.md

---

## 1. Overview

This proposal introduces two new tables to support the Automated Job Prospector feature:

1. `prospecting_profiles` — stores JB's saved search configuration; one row per user (enforced by RLS + unique constraint)
2. `prospecting_runs` — append-only audit log of every prospector execution

Neither table has been applied to any environment. This document is the specification for the migration that Supabase-Security will author when implementation is authorized by JB.

---

## 2. Table: `prospecting_profiles`

### Purpose

Stores the search configuration for the automated prospector. One profile per user. RLS ensures a user can only read and write their own row (BR-101, BR-001, BR-005).

### DDL Proposal

```sql
CREATE TABLE public.prospecting_profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Search parameters
  job_title      text NOT NULL CHECK (char_length(job_title) > 0 AND char_length(job_title) <= 200),
  location       text CHECK (char_length(location) <= 200),
  job_type       text NOT NULL CHECK (job_type IN ('full-time', 'contract', 'part-time')),
  environment    text NOT NULL CHECK (environment IN ('remote', 'hybrid', 'in-office')),
  salary_min     integer CHECK (salary_min >= 0),
  salary_max     integer CHECK (salary_max >= 0),
  skills         text[] DEFAULT '{}',

  -- Runtime state
  is_active      boolean NOT NULL DEFAULT false,
  last_run_at    timestamptz,
  next_run_at    timestamptz,

  -- Audit
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Ensure salary_min <= salary_max when both provided
  CONSTRAINT salary_range_valid CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
  ),

  -- Enforce skills array max length (20 tags)
  CONSTRAINT skills_max_20 CHECK (array_length(skills, 1) IS NULL OR array_length(skills, 1) <= 20),

  -- One profile per user
  CONSTRAINT one_profile_per_user UNIQUE (user_id)
);

-- updated_at trigger (consistent with TRG-002 pattern from 09-supabase-handoff.md)
CREATE TRIGGER trg_prospecting_profiles_updated_at
  BEFORE UPDATE ON public.prospecting_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.prospecting_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_profile"
  ON public.prospecting_profiles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_profile"
  ON public.prospecting_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_profile"
  ON public.prospecting_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy. Profiles are deactivated (is_active = false), not deleted.
-- If GDPR deletion is required (PRIV-001), a service-role function handles it.
```

### RLS Policy Summary

| Operation | Policy |
| --- | --- |
| SELECT | `user_id = auth.uid()` |
| INSERT | `user_id = auth.uid()` |
| UPDATE | `user_id = auth.uid()` (both USING and WITH CHECK) |
| DELETE | No client-side policy — service-role only (GDPR purge path) |

### Indexes

```sql
-- Primary key covers id lookups.
-- user_id unique constraint covers single-profile lookup.
-- is_active index for cron scheduler to find runnable profiles efficiently.
CREATE INDEX idx_prospecting_profiles_active
  ON public.prospecting_profiles (user_id)
  WHERE is_active = true;
```

### Notes

- `one_profile_per_user` UNIQUE constraint ensures database-level enforcement regardless of application logic.
- `salary_range_valid` CHECK constraint enforces the business rule `salary_min <= salary_max` at the DB layer (backs up client-side validation in AC-016-02).
- `skills_max_20` CHECK constraint enforces BR-105 / AC-016-03 at the DB layer.
- The `set_updated_at()` function is assumed to already exist from the core schema migration (TRG-002 in 09-supabase-handoff.md). If it does not exist, it must be created in a prior migration.

---

## 3. Table: `prospecting_runs`

### Purpose

Append-only audit log for every prospector execution. One row per run. Records outcome statistics and error details. Never updated or deleted (consistent with the event-sourcing principle — BR-002, BR-003 extended to prospector runs).

### DDL Proposal

```sql
CREATE TABLE public.prospecting_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.prospecting_profiles(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Run outcome
  run_at         timestamptz NOT NULL DEFAULT now(),
  jobs_found     integer NOT NULL DEFAULT 0 CHECK (jobs_found >= 0),
  jobs_queued    integer NOT NULL DEFAULT 0 CHECK (jobs_queued >= 0),
  status         text NOT NULL CHECK (status IN ('success', 'empty', 'partial', 'error', 'queued')),
  error          text,

  -- No updated_at — this table is append-only
  -- No DELETE policy — audit trail
  CONSTRAINT jobs_queued_lte_found CHECK (jobs_queued <= jobs_found)
);

-- RLS
ALTER TABLE public.prospecting_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_runs"
  ON public.prospecting_runs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_runs"
  ON public.prospecting_runs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No UPDATE policy — runs are immutable once written (consistent with application_events)
-- No DELETE policy — audit trail integrity
```

### RLS Policy Summary

| Operation | Policy |
| --- | --- |
| SELECT | `user_id = auth.uid()` |
| INSERT | `user_id = auth.uid()` |
| UPDATE | No policy — append-only |
| DELETE | No policy — append-only audit trail |

### Status Enum Values

| Value | Meaning |
| --- | --- |
| `success` | Run completed; one or more jobs found and scored |
| `empty` | Run completed; zero jobs found (BR-106) |
| `partial` | Run completed; some jobs scored; one or more scoring failures logged in `error` |
| `error` | Run failed before completion; `error` field contains detail |
| `queued` | AI scoring deferred because monthly cost cap was reached (BR-104) |

### Indexes

```sql
-- Most-recent run lookup (used for "Last run" display in UI)
CREATE INDEX idx_prospecting_runs_recent
  ON public.prospecting_runs (profile_id, run_at DESC);

-- User-scoped run history
CREATE INDEX idx_prospecting_runs_user
  ON public.prospecting_runs (user_id, run_at DESC);
```

---

## 4. Impact on Existing Tables

### `jobs` table (E-004)

The prospector will insert rows into the existing `jobs` table. The `source` column already exists (`source text` per E-004 in 03-data-entities.md).

**Proposed constraint addition (migration):**

No schema change is required to `jobs` beyond ensuring the existing `UNIQUE` constraint on `source_url` (CHK-001 from 09-supabase-handoff.md) is in place. Prospector deduplication (BR-102, BR-063) relies on this constraint.

The prospector sets `source = 'prospector'` on inserted rows. The "Ready to Apply" view filters on this value (BR-105).

**No new columns are needed on `jobs` for the prospector.** The profile FK is captured in `prospecting_runs`, not in each individual job row — this keeps the jobs table free from prospector-specific coupling.

---

## 5. "Ready to Apply" Queue

### Query Strategy

The "Ready to Apply" queue is **not a materialized view** — it is a runtime query. A materialized view would require a refresh mechanism and adds operational complexity without meaningful performance benefit at the projected volume.

**Proposed query pattern (to be executed by `ProspectorDashboard` via Supabase client):**

```sql
SELECT
  j.id,
  j.title,
  j.user_id,
  c.name AS company_name,
  s.overall_score AS match_score,
  a.id AS application_id
FROM public.jobs j
  JOIN public.ai_scores s ON s.job_id = j.id AND s.user_id = j.user_id
  LEFT JOIN public.companies c ON c.id = j.company_id
  LEFT JOIN public.applications a ON a.job_id = j.id AND a.user_id = j.user_id
WHERE
  j.user_id = auth.uid()          -- BR-005: user scoping
  AND j.source = 'prospector'     -- BR-105: prospector source only
  AND s.overall_score >= 60       -- BR-105, BR-020: score threshold (cite BR-020, not literal)
ORDER BY s.overall_score DESC;
```

**Notes:**
- The score threshold is not hardcoded in migration SQL — it is enforced at the query layer in the application (backing BR-020 and LSN-001: cite the BR, not a literal). If this query is ever promoted to a database view, the threshold should be stored in a config table, not hardcoded in the view definition.
- RLS on `jobs`, `ai_scores`, `applications`, and `companies` ensures cross-user data cannot leak.
- The query is user-scoped at the application layer and enforced again at the RLS layer (defence in depth).

### Why Not a Materialized View

| Factor | Assessment |
| --- | --- |
| Refresh complexity | A materialized view needs `REFRESH MATERIALIZED VIEW` on each scoring run; adds an extra step in the Edge Function |
| Stale data risk | Between refreshes, the queue shows outdated scores — problematic for a feature where JB acts on what he sees |
| Volume | At projected scale (60 jobs/day prospector output), a simple join query is sub-100ms with the proposed indexes |
| Operational cost | Each materialized view refresh consumes compute time, which counts toward Supabase plan limits |

**Recommendation: runtime query with indexes** is the correct pattern for this feature.

---

## 6. Cron Strategy Recommendation

### Options Evaluated

#### Option A — pg_cron (runs inside Supabase PostgreSQL)

pg_cron is a PostgreSQL extension available on Supabase Pro and above plans. A cron job is registered inside the database and calls a Supabase Edge Function (or a database function) on schedule.

**Pros:**
- Runs entirely within Supabase infrastructure; no external scheduler dependency
- Survives app deployments; configuration lives in the database
- Free on Supabase Pro (no additional cost)
- Supports standard cron expressions (`0 6,18 * * *` for 6 AM and 6 PM daily)

**Cons:**
- pg_cron can only trigger SQL functions or HTTP calls from inside the DB; for the prospector's full scrape+score pipeline, it would need to call an Edge Function via `pg_net` extension, adding a small amount of coupling
- Debugging is less visible than external schedulers (logs require querying `cron.job_run_details`)

**Cost impact:** Zero incremental AI or compute cost for the scheduler itself. The AI scoring calls (Claude Opus 4.6 via ai-router.ts) are the cost driver — these are identical regardless of what triggered the run.

#### Option B — Edge Function + External Scheduler (e.g., Supabase Cron via the Dashboard, or a Vercel Cron)

Supabase now provides a built-in "Edge Function Schedules" feature (in Supabase Dashboard → Edge Functions → Schedules). This registers a cron schedule that triggers an Edge Function without requiring pg_cron.

**Pros:**
- No pg_cron extension required (works on any Supabase plan tier)
- Logs visible natively in Supabase Edge Function logs dashboard
- Easier to pause/resume per profile without a DB migration
- Vercel Cron is an alternative if Supabase Edge Function Schedules are unavailable on the current plan

**Cons:**
- External trigger; if the Supabase scheduling service has an outage, runs are missed (but BR-100 treats missed runs as no-ops, so this is a safe failure)
- One scheduled Edge Function must read all active profiles and fan out — slightly more complex than per-profile pg_cron rows

### Recommendation: Option B — Edge Function Schedule (Supabase Dashboard Cron)

**Rationale tied to the $75/month cost ceiling (BR-050):**

The cron scheduler itself has zero AI cost impact — the cost driver is the AI scoring volume. The recommendation is based on operational simplicity and cost predictability:

1. **No pg_cron extension overhead.** pg_cron on Supabase Pro is included, but activating additional extensions increases migration surface area. Keeping extensions minimal reduces maintenance risk.

2. **Single Edge Function for all active profiles.** A single `run-prospector` Edge Function, triggered on schedule, reads all `prospecting_profiles WHERE is_active = true` and runs the scrape+score pipeline for each. This is one cold start, not one per user.

3. **Cost guard is inside the Edge Function, not the scheduler.** The $75/month cap check (BR-052, BR-053, BR-104) executes inside `ai-router.ts` before each AI call. The scheduler simply triggers the function — it does not enforce cost policy. This separation of concerns is correct regardless of cron strategy.

4. **`is_active = false` compliance.** The Edge Function reads `is_active` at runtime and skips inactive profiles. This satisfies BR-107 (disabling halts cron-triggered runs immediately) without needing to remove/add pg_cron rows.

5. **Schedule:** `0 6,18 * * *` UTC — triggers at 06:00 and 18:00 UTC daily, satisfying the "twice daily / every 12 hours" requirement (BR-100).

**Implementation path (for future Feature-Dev gate):**

- Create `supabase/functions/run-prospector/index.ts`
- Register schedule via Supabase Dashboard (or `supabase.toml` `[functions.run-prospector]` cron field)
- Edge Function logic:
  1. Fetch all `prospecting_profiles WHERE is_active = true`
  2. For each profile: scrape approved sources using profile parameters
  3. Deduplicate against existing `jobs.source_url` (BR-102)
  4. Insert new jobs with `source = 'prospector'`
  5. Call `ai-router.ts` `match_scoring` for each new job
  6. Write `prospecting_runs` row with outcome statistics
  7. Update `prospecting_profiles.last_run_at` and `next_run_at`

---

## 7. Privacy and GDPR Considerations

Per PRIV-001, a user data deletion must purge all related tables. The prospector tables must be added to the GDPR deletion scope:

| Table | Deletion Action |
| --- | --- |
| `prospecting_profiles` | DELETE WHERE user_id = {user_id} (cascades to `prospecting_runs` via FK) |
| `prospecting_runs` | Cascade delete from `prospecting_profiles` (ON DELETE CASCADE on profile_id FK) |

The `ON DELETE CASCADE` on `prospecting_runs.profile_id` ensures that deleting a profile also removes its run history. The `ON DELETE CASCADE` on both tables' `user_id` FK to `auth.users` ensures user deletion from Supabase Auth purges all prospector data.

---

## 8. Security Checklist

Before this migration is applied, Supabase-Security must verify:

- [ ] BR-001: RLS enabled on both new tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] BR-005: All SELECT/INSERT/UPDATE policies filter by `user_id = auth.uid()`
- [ ] BR-006: `SUPABASE_SERVICE_ROLE_KEY` not referenced in any `src/` file added for this feature
- [ ] No DELETE or UPDATE policy on `prospecting_runs` (append-only, consistent with `application_events`)
- [ ] UNIQUE constraint `one_profile_per_user` is present on `prospecting_profiles`
- [ ] `salary_range_valid` CHECK constraint enforces `salary_min <= salary_max`
- [ ] `skills_max_20` CHECK constraint enforces 20-tag limit
- [ ] `set_updated_at()` trigger function exists before migration runs (or is created in same migration)
- [ ] `prospecting_runs` is added to GDPR deletion scope (PRIV-001)
- [ ] All new foreign keys specify ON DELETE behavior (CASCADE on user_id and profile_id)
- [ ] After migration: run `pnpm db:gen-types` and commit `src/types/db.types.ts` (BR-081, BR-082)

---

## 9. Dependency Order for Migration

This migration batch depends on the core schema (14 entities) already being in place. Safe migration order:

```
[existing] auth.users                    — Supabase managed
[existing] public.jobs                   — E-004, requires source_url UNIQUE (CHK-001)
  ↓
[new] public.prospecting_profiles        — FK → auth.users
  ↓
[new] public.prospecting_runs            — FK → prospecting_profiles, auth.users
```

If CHK-001 (UNIQUE on `jobs.source_url`) has not yet been applied, it must be included in the same migration batch or a prior one.

---

## 10. Cross-References

| Concern | Reference |
| --- | --- |
| RLS patterns | docs/domain/auth.md §5 |
| User scoping | BR-001, BR-005, SEC-001, SEC-006 |
| Append-only audit | BR-003 (extended to prospecting_runs) |
| Cost cap enforcement | BR-050, BR-052, BR-053, BR-104 |
| Deduplication | BR-063, BR-102 |
| Score threshold | BR-020, BR-105 — cite BR IDs, not literals (LSN-001) |
| Run frequency | BR-100 |
| Toggle behavior | BR-107 |
| Empty run handling | BR-106 |
| GDPR deletion | PRIV-001 (docs/requirements/06-security-compliance.md) |
| Types generation | BR-081, BR-082, CLAUDE.md |
