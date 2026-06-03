-- ============================================================
-- Migration: 20260603000003_create_companies
-- Entity:    E-003 — companies
-- Batch:     1 — Foundation
-- Security:  Shared lookup; authenticated SELECT only;
--            INSERT/UPDATE via service role (Edge Functions) only.
--            No user_id column — not scoped per user by design.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text  NOT NULL,
  domain       text,
  industry     text,
  size_range   text,
  linkedin_url text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_idx
  ON public.companies (domain)
  WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_name_idx ON public.companies (name);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read all companies (shared lookup table).
-- No public/anon access — satisfies SEC-001.
CREATE POLICY "Companies: select for authenticated"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated role.
-- All writes go through service-role Edge Functions (job ingestion).
-- The Supabase service role bypasses RLS — no policy needed here.
