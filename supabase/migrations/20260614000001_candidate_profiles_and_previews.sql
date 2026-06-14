-- ============================================================
-- Migration: 20260614000001_candidate_profiles_and_previews
-- Phase 4 GAP-010 closure — Batch 7
--
-- Two user-scoped tables, both RLS-enabled (BR-001/005):
--   1) candidate_profiles — single editable source-of-truth for the master
--      profile + the PII (email/phone) ATS application forms require. Replaces
--      client-side masterProfile.ts as the PII source (PII must not live in the
--      browser bundle). One row per user (UNIQUE user_id).
--   2) submission_previews — shadow-validate artifacts. The submission worker
--      (service role) writes the would-be ATS request (endpoint + payload +
--      resume ref + any unfillable fields) here WITHOUT POSTing, so JB can
--      review the exact request before the first real send (decision 2026-06-14).
--
-- Service role bypasses RLS, so the worker can write previews; authenticated
-- users may read/approve/reject ONLY their own rows.
-- ============================================================

-- 1) candidate_profiles ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          text NOT NULL DEFAULT '',
  email              text NOT NULL DEFAULT '',
  phone              text NOT NULL DEFAULT '',
  location           text NOT NULL DEFAULT '',
  linkedin_url       text,
  website_url        text,
  work_authorization text NOT NULL DEFAULT '',
  -- Storage path (in the 'documents' bucket) to the JB-provided master resume PDF.
  master_resume_path text,
  -- Optional EEO / voluntary-disclosure answers (default: decline to answer).
  eeo_disclosures    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidate profile: select own"
  ON public.candidate_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Candidate profile: insert own"
  ON public.candidate_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Candidate profile: update own"
  ON public.candidate_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Candidate profile: delete own"
  ON public.candidate_profiles FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER set_candidate_profiles_updated_at
  BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 2) submission_previews ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_previews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id  uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  channel         text NOT NULL DEFAULT 'manual',
  vendor          text,
  endpoint        text,
  -- The exact fields/body that WOULD be POSTed to the ATS (no secrets).
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resume_path     text,
  -- Required fields/answers the worker could not fill (flags manual attention).
  missing         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

ALTER TABLE public.submission_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submission preview: select own"
  ON public.submission_previews FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Submission preview: insert own"
  ON public.submission_previews FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Submission preview: update own"
  ON public.submission_previews FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Submission preview: delete own"
  ON public.submission_previews FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER set_submission_previews_updated_at
  BEFORE UPDATE ON public.submission_previews
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_submission_previews_user_status
  ON public.submission_previews (user_id, status);
