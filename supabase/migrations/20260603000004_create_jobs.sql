-- ============================================================
-- Migration: 20260603000004_create_jobs
-- Entity:    E-004 — jobs
-- Batch:     2 — Job and Recruiter Layer
-- Security:  user_id scoped; UNIQUE(source_url); full CRUD
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id          uuid        REFERENCES public.companies (id) ON DELETE RESTRICT,
  title               text        NOT NULL,
  location            text,
  remote_type         text        CHECK (remote_type IN ('remote', 'hybrid', 'onsite')),
  compensation_min    integer     CHECK (compensation_min >= 0),
  compensation_max    integer     CHECK (compensation_max >= 0),
  -- Guard: max must be >= min when both are present
  CONSTRAINT jobs_compensation_range_check
    CHECK (compensation_max IS NULL OR compensation_min IS NULL
           OR compensation_max >= compensation_min),
  description         text,
  skills              text[]      NOT NULL DEFAULT '{}',
  source              text,
  source_url          text        NOT NULL,
  application_method  text        CHECK (application_method IN ('api', 'manual', 'ats')),
  posted_at           timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- CHK-001: deduplicate job ingestion by source_url (BR-063)
CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_url_idx ON public.jobs (source_url);

CREATE INDEX IF NOT EXISTS jobs_user_id_idx       ON public.jobs (user_id);
CREATE INDEX IF NOT EXISTS jobs_company_id_idx    ON public.jobs (company_id);
CREATE INDEX IF NOT EXISTS jobs_posted_at_idx     ON public.jobs (posted_at DESC);

-- GIN index for skills array lookups (tag-based filtering)
CREATE INDEX IF NOT EXISTS jobs_skills_gin_idx    ON public.jobs USING gin (skills);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jobs: select own"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Jobs: insert own"
  ON public.jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Jobs: update own"
  ON public.jobs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Jobs: delete own"
  ON public.jobs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
