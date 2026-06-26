-- ============================================================
-- Migration: 20260622000001_create_job_corpus
-- Feature:   Shared ATS job-posting search & indexing engine (ADR-019, ADR-015)
-- Tables:    ats_boards, job_posting_snapshots, job_postings
--
-- SHARED, NOT user-scoped corpus of PUBLIC job postings (ADR-019). These tables
-- carry NO user_id and NO PII — they hold only data already published on public
-- ATS boards. RLS stays ENABLED on every table; the posture is:
--   * SELECT  → TO authenticated USING (true)   (read the whole corpus)
--   * INSERT/UPDATE/DELETE → NO policy           (writes are service-role only;
--                                                 service_role bypasses RLS, the
--                                                 same boundary the submission
--                                                 worker / prep cron already use)
-- HARD INVARIANT (ADR-019 Decision 4): never add a user_id / PII column here.
-- Per-user concerns live in the existing user-scoped tables; the service-role
-- projector copies matches into the user-scoped `jobs` table (left UNCHANGED).
--
-- Indexing (ADR-015 Decision 5): Postgres-native FTS (weighted tsvector + GIN)
-- + pg_trgm fuzzy + partial btree filters. No pgvector, no external cluster.
--
-- Additive only + RLS-on (BR-001/005). Applied to the hosted project via MCP
-- apply_migration; this file is the repo record (do NOT `supabase db push` —
-- see remote-workflow notes).
-- ============================================================

-- pg_trgm for fuzzy title/company matching. Installed into the `extensions`
-- schema (Supabase convention; already in the database search_path) so
-- gin_trgm_ops resolves unqualified below.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 1) ats_boards — crawl seed / board registry + incremental-sync state --------
CREATE TABLE IF NOT EXISTS public.ats_boards (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_family           text NOT NULL
                         CHECK (ats_family IN ('greenhouse','lever','ashby','smartrecruiters','workday','other')),
  -- Greenhouse board_token / Lever site / Ashby org / SmartRecruiters company /
  -- Workday "tenant|dc|site". The stable per-family board identifier.
  board_token          text NOT NULL,
  display_name         text,
  company_id           uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  -- Anti-bot read tier exposed by the adapter (ADR-013 BR-157); gating reads on
  -- the tier, never on a hard-coded platform name.
  antibot_tier         text NOT NULL DEFAULT 'unknown'
                         CHECK (antibot_tier IN ('low','medium','high','unknown')),
  is_active            boolean NOT NULL DEFAULT true,
  -- Incremental-sync state (ADR-015 Decision 6).
  last_synced_at       timestamptz,
  last_etag            text,                 -- conditional GET (GH/Ashby) → 304 skip
  last_status          text NOT NULL DEFAULT 'never'
                         CHECK (last_status IN ('ok','partial','error','blocked','never')),
  consecutive_failures integer NOT NULL DEFAULT 0,   -- circuit breaker
  discovered_via       text NOT NULL DEFAULT 'seed'
                         CHECK (discovered_via IN ('seed','serpapi','sitemap','manual')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ats_boards_uniq UNIQUE (ats_family, board_token)
);

CREATE INDEX IF NOT EXISTS ats_boards_active_idx
  ON public.ats_boards (ats_family, last_synced_at NULLS FIRST)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS ats_boards_company_idx ON public.ats_boards (company_id);

CREATE TRIGGER set_ats_boards_updated_at
  BEFORE UPDATE ON public.ats_boards
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.ats_boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ATS boards: read all" ON public.ats_boards;
CREATE POLICY "ATS boards: read all"
  ON public.ats_boards FOR SELECT TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy: writes are service-role-only.

-- 2) job_posting_snapshots — append-only raw fetch audit ----------------------
CREATE TABLE IF NOT EXISTS public.job_posting_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES public.ats_boards(id) ON DELETE CASCADE,
  external_job_id text NOT NULL,
  raw_payload     jsonb NOT NULL,
  content_hash    text NOT NULL,        -- sha256 of the normalized subset (ADR-015 Decision 6)
  fetched_at      timestamptz NOT NULL DEFAULT now()
  -- Append-only: no updated_at, no UPDATE/DELETE policy.
);

CREATE INDEX IF NOT EXISTS job_snapshots_board_job_idx
  ON public.job_posting_snapshots (board_id, external_job_id, fetched_at DESC);

ALTER TABLE public.job_posting_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Job posting snapshots: read all" ON public.job_posting_snapshots;
CREATE POLICY "Job posting snapshots: read all"
  ON public.job_posting_snapshots FOR SELECT TO authenticated
  USING (true);
-- No write policy: service-role-only.

-- 3) job_postings — normalized canonical corpus (the searchable index) --------
CREATE TABLE IF NOT EXISTS public.job_postings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id           uuid NOT NULL REFERENCES public.ats_boards(id) ON DELETE CASCADE,
  ats_family         text NOT NULL,
  external_job_id    text NOT NULL,
  company_id         uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name       text,
  title              text NOT NULL,
  location_raw       text,
  remote_type        text CHECK (remote_type IN ('remote','hybrid','onsite')),
  department         text,
  team               text,
  employment_type    text,
  description_html   text,
  description_text   text,
  application_url    text NOT NULL,
  external_url       text,
  salary_min         integer CHECK (salary_min >= 0),
  salary_max         integer CHECK (salary_max >= 0),
  salary_currency    text,
  salary_interval    text CHECK (salary_interval IS NULL
                                 OR salary_interval IN ('year','month','week','day','hour')),
  posted_at          timestamptz,
  content_hash       text NOT NULL,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Weighted full-text vector (ADR-015 Decision 5). Immutable expression → STORED.
  search_tsv         tsvector GENERATED ALWAYS AS (
                       setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                       setweight(to_tsvector('english', coalesce(company_name, '')), 'B') ||
                       setweight(to_tsvector('english', coalesce(department, '') || ' ' || coalesce(team, '')), 'C') ||
                       setweight(to_tsvector('english', coalesce(description_text, '')), 'D')
                     ) STORED,
  CONSTRAINT job_postings_comp_range
    CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min),
  -- Canonical identity: one row per posting per board (upsert key, ADR-015 Decision 6).
  CONSTRAINT job_postings_identity UNIQUE (ats_family, board_id, external_job_id)
);

-- Full-text + fuzzy + filter indexes.
CREATE INDEX IF NOT EXISTS job_postings_tsv_idx
  ON public.job_postings USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS job_postings_title_trgm_idx
  ON public.job_postings USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS job_postings_company_trgm_idx
  ON public.job_postings USING gin (company_name gin_trgm_ops);
-- Active-only filter facets (the projector + search UI never want closed rows).
CREATE INDEX IF NOT EXISTS job_postings_posted_idx
  ON public.job_postings (posted_at DESC) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS job_postings_remote_idx
  ON public.job_postings (remote_type) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS job_postings_dept_idx
  ON public.job_postings (department) WHERE closed_at IS NULL;
-- Board-scoped active scan for close-missing set difference (ADR-015 Decision 6).
CREATE INDEX IF NOT EXISTS job_postings_board_active_idx
  ON public.job_postings (board_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS job_postings_company_idx
  ON public.job_postings (company_id);

CREATE TRIGGER set_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Job postings: read all" ON public.job_postings;
CREATE POLICY "Job postings: read all"
  ON public.job_postings FOR SELECT TO authenticated
  USING (true);
-- No write policy: service-role-only.
