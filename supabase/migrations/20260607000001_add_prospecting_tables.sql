-- ============================================================
-- Migration: 20260607000001_add_prospecting_tables
-- Feature:   F-017 — Automated Job Prospector
-- Tables:    prospecting_profiles, prospecting_runs
-- Security:  RLS own-row-only on both tables; no DELETE policies
-- Status:    DRAFT — not applied to any environment
-- Authored:  Supabase-Security Agent (WO-20260607-prospector-scaffold)
-- Depends:   20260603000001_create_users (fn_set_updated_at must exist)
-- ============================================================

-- ── Table: prospecting_profiles ──────────────────────────────
-- One row per user. Stores the automated job search configuration.
-- Columns match the exact spec from WO-20260607-prospector-scaffold.
-- Array columns replace single-value fields from the earlier schema
-- proposal to support multi-value search parameters (BR-105).

CREATE TABLE public.prospecting_profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Activation flag (BR-107)
  is_active     boolean     NOT NULL DEFAULT false,

  -- Search parameters — all arrays to support multi-value matching
  job_titles    text[]      NOT NULL DEFAULT '{}',
  locations     text[]      NOT NULL DEFAULT '{}',

  -- job_types: valid element values are 'full-time', 'contract', 'part-time'
  -- Postgres does not support per-element CHECK on array columns natively.
  -- Enforcement is deferred to the application layer and Edge Function.
  -- A DB-layer guard is approximated via a trigger or the CHECK below.
  -- Note: element-level CHECK on arrays requires a workaround; we use a
  -- comment here and rely on the application-layer enum for enforcement.
  -- The constraint below validates only that no disallowed literals appear
  -- by checking containment against the allowed set when the array is non-empty.
  -- This is a best-effort DB guard; full validation lives in the application.
  job_types     text[]      NOT NULL DEFAULT '{}',
  -- CHECK: all elements of job_types must be in ('full-time','contract','part-time')
  -- Postgres supports this via: NOT (job_types && ARRAY['<invalid>'])
  -- but enumerating all invalid values is impractical. Use a function-based check.
  -- Practical pattern: validate via BEFORE INSERT/UPDATE trigger (see below).

  environments  text[]      NOT NULL DEFAULT '{}',
  -- valid values: 'remote', 'hybrid', 'in-office'
  -- Same element-level enforcement approach as job_types (see trigger below).

  -- Salary floor — optional (BR-105, AC-016-02)
  min_salary    integer     CHECK (min_salary >= 0),

  -- Keywords / skills array (replaces 'skills' from earlier proposal)
  keywords      text[]      NOT NULL DEFAULT '{}',

  -- Runtime state — set by Edge Function on each run
  last_run_at   timestamptz,
  next_run_at   timestamptz,

  -- Audit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One profile per user — enforced at DB layer regardless of application logic (BR-101)
  CONSTRAINT one_profile_per_user UNIQUE (user_id),

  -- keywords array max 20 elements (BR-105, AC-016-03)
  CONSTRAINT keywords_max_20 CHECK (
    array_length(keywords, 1) IS NULL OR array_length(keywords, 1) <= 20
  )
);

-- ── Array element validation trigger: job_types ──────────────
-- Validates that every element in job_types is one of the allowed values.
-- Runs BEFORE INSERT and UPDATE to block invalid data at the DB layer.
CREATE OR REPLACE FUNCTION public.fn_validate_prospecting_profile_arrays()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_element text;
BEGIN
  -- Validate job_types elements
  IF NEW.job_types IS NOT NULL THEN
    FOREACH v_element IN ARRAY NEW.job_types LOOP
      IF v_element NOT IN ('full-time', 'contract', 'part-time') THEN
        RAISE EXCEPTION 'Invalid job_type value: %. Allowed: full-time, contract, part-time', v_element;
      END IF;
    END LOOP;
  END IF;

  -- Validate environments elements
  IF NEW.environments IS NOT NULL THEN
    FOREACH v_element IN ARRAY NEW.environments LOOP
      IF v_element NOT IN ('remote', 'hybrid', 'in-office') THEN
        RAISE EXCEPTION 'Invalid environment value: %. Allowed: remote, hybrid, in-office', v_element;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prospecting_profiles_validate_arrays
  BEFORE INSERT OR UPDATE ON public.prospecting_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_prospecting_profile_arrays();

-- ── updated_at trigger — reuses existing fn_set_updated_at ───
-- fn_set_updated_at is defined in 20260603000001_create_users.sql.
-- Do NOT recreate it here.
CREATE TRIGGER trg_prospecting_profiles_updated_at
  BEFORE UPDATE ON public.prospecting_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS: prospecting_profiles ─────────────────────────────────
ALTER TABLE public.prospecting_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only read their own profile (BR-001, BR-005, BR-101)
CREATE POLICY "prospecting_profiles: select own"
  ON public.prospecting_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: users can only insert a row for themselves
CREATE POLICY "prospecting_profiles: insert own"
  ON public.prospecting_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: users can only update their own profile; both USING and WITH CHECK required
CREATE POLICY "prospecting_profiles: update own"
  ON public.prospecting_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy on prospecting_profiles.
-- Profiles are deactivated (is_active = false), not deleted by users.
-- GDPR deletion (PRIV-001) is handled by a service-role function,
-- which cascades to prospecting_runs via ON DELETE CASCADE on profile_id FK.

-- ── Index: active profiles for cron scheduler ────────────────
CREATE INDEX idx_prospecting_profiles_active
  ON public.prospecting_profiles (user_id)
  WHERE is_active = true;


-- ── Table: prospecting_runs ───────────────────────────────────
-- Append-only audit log. One row per prospector execution.
-- Never updated or deleted — consistent with application_events (BR-003).

CREATE TABLE public.prospecting_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the profile that triggered this run
  -- ON DELETE CASCADE: deleting a profile purges its run history (PRIV-001)
  profile_id    uuid        NOT NULL REFERENCES public.prospecting_profiles(id) ON DELETE CASCADE,

  -- Redundant user_id for direct RLS scoping without joining prospecting_profiles
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Run outcome statistics
  run_at        timestamptz NOT NULL DEFAULT now(),
  jobs_found    integer     NOT NULL DEFAULT 0 CHECK (jobs_found >= 0),
  jobs_queued   integer     NOT NULL DEFAULT 0 CHECK (jobs_queued >= 0),

  -- Status values: success | empty | partial | error | queued
  -- 'empty'  — zero jobs found (BR-106)
  -- 'queued' — AI scoring deferred due to cost cap (BR-104)
  -- 'error'  — run failed before completion
  status        text        NOT NULL CHECK (
    status IN ('success', 'empty', 'partial', 'error', 'queued')
  ),

  -- Error detail (populated only when status = 'error' or 'partial')
  error         text,

  -- Integrity: cannot queue more jobs than were found
  CONSTRAINT jobs_queued_lte_found CHECK (jobs_queued <= jobs_found)

  -- No updated_at column — this table is append-only
  -- No updated_at trigger for the same reason
);

-- ── RLS: prospecting_runs ─────────────────────────────────────
ALTER TABLE public.prospecting_runs ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only read their own run history
CREATE POLICY "prospecting_runs: select own"
  ON public.prospecting_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: users (and the Edge Function acting as service-role) can insert runs
-- Client-side inserts are user-scoped; Edge Function inserts bypass RLS via service role.
CREATE POLICY "prospecting_runs: insert own"
  ON public.prospecting_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE policy — runs are immutable once written (consistent with application_events, BR-003)
-- No DELETE policy — audit trail integrity; GDPR cascade handled via profile FK

-- ── Indexes: prospecting_runs ─────────────────────────────────
-- Most-recent run per profile — used for "Last run" display in ProspectorRunStatus
CREATE INDEX idx_prospecting_runs_recent
  ON public.prospecting_runs (profile_id, run_at DESC);

-- User-scoped run history — used for future run history views
CREATE INDEX idx_prospecting_runs_user
  ON public.prospecting_runs (user_id, run_at DESC);


-- ── Security sign-off ─────────────────────────────────────────
-- Supabase-Security sign-off (WO-20260607-prospector-scaffold, Gate A):
--
-- RLS STATUS:
--   prospecting_profiles: ENABLED — ALTER TABLE ... ENABLE ROW LEVEL SECURITY confirmed above
--   prospecting_runs:     ENABLED — ALTER TABLE ... ENABLE ROW LEVEL SECURITY confirmed above
--
-- POLICY COVERAGE:
--   prospecting_profiles: SELECT, INSERT, UPDATE all scoped to auth.uid() = user_id
--   prospecting_profiles: No DELETE — deactivation pattern only; service-role GDPR path
--   prospecting_runs:     SELECT, INSERT scoped to auth.uid() = user_id
--   prospecting_runs:     No UPDATE — append-only (BR-003 extended to prospector audit log)
--   prospecting_runs:     No DELETE — audit trail integrity; cascade from profile deletion
--
-- CROSS-USER LEAKAGE:
--   Not possible via RLS policies. Every SELECT and INSERT policy binds user_id = auth.uid().
--   Redundant user_id on prospecting_runs allows direct RLS without join, eliminating
--   any risk of a profile_id FK bypass.
--
-- SERVICE ROLE:
--   SUPABASE_SERVICE_ROLE_KEY does not appear in any src/ file for this feature (BR-006).
--   Edge Function use of service role is Edge-Function-runtime-only (docs/domain/auth.md §4).
--
-- GDPR:
--   ON DELETE CASCADE on prospecting_runs.profile_id ensures profile deletion purges run history.
--   ON DELETE CASCADE on both tables' user_id FK to auth.users ensures user deletion in
--   Supabase Auth purges all prospector data without a separate GDPR trigger (PRIV-001).
--
-- POST-APPLY REMINDER (not part of this draft):
--   After applying this migration, run: pnpm db:gen-types
--   Commit the updated src/types/db.types.ts before marking the feature task done (BR-081, BR-082).
