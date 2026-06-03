-- ============================================================
-- Migration: 20260603000005_create_recruiters
-- Entity:    E-005 — recruiters
-- Batch:     2 — Job and Recruiter Layer
-- Security:  user_id scoped; full CRUD
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recruiters (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  company_id    uuid        REFERENCES public.companies (id) ON DELETE RESTRICT,
  name          text        NOT NULL,
  email         text,
  linkedin_url  text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS recruiters_user_id_idx    ON public.recruiters (user_id);
CREATE INDEX IF NOT EXISTS recruiters_company_id_idx ON public.recruiters (company_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters: select own"
  ON public.recruiters FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Recruiters: insert own"
  ON public.recruiters FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Recruiters: update own"
  ON public.recruiters FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Recruiters: delete own"
  ON public.recruiters FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
