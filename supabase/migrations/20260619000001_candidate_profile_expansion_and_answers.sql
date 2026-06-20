-- ============================================================
-- Migration: 20260619000001_candidate_profile_expansion_and_answers
-- Phase 2b apply-macro — expand candidate_profiles to the full ATS
-- application field surface, and add the reusable "answer library"
-- (Hybrid storage decision, JB 2026-06-19):
--   • Fixed EEO / demographic answers → candidate_profiles.eeo_disclosures
--     jsonb (column already exists; documented shape below).
--   • Arbitrary / growing custom screener Q&A → new application_answers
--     table (one reusable row per (user_id, question_key)).
--
-- Additive only + RLS-on (BR-001/005). No destructive changes.
-- Applied to the hosted project via MCP apply_migration; this file is the
-- repo record (do NOT `supabase db push` — see remote-workflow notes).
-- ============================================================

-- 1) candidate_profiles — new scalar identity / eligibility columns ---------
ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS preferred_name       text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_country        text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state                text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requires_sponsorship boolean,
  ADD COLUMN IF NOT EXISTS security_clearance   text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS drivers_license      text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employment_history   jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- eeo_disclosures jsonb already exists; documented shape (all keys optional):
--   { "gender", "race_ethnicity", "hispanic_latino", "veteran_status",
--     "disability_status" }  -- each a free-text answer or "decline".

-- 2) application_answers — reusable custom-screener answer library ----------
CREATE TABLE IF NOT EXISTS public.application_answers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_key   text NOT NULL,
  question_label text NOT NULL DEFAULT '',
  answer         text NOT NULL DEFAULT '',
  answer_type    text NOT NULL DEFAULT 'text', -- 'text' | 'boolean' | 'choice'
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_key)
);

ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Application answers: select own" ON public.application_answers;
CREATE POLICY "Application answers: select own"
  ON public.application_answers FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Application answers: insert own" ON public.application_answers;
CREATE POLICY "Application answers: insert own"
  ON public.application_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Application answers: update own" ON public.application_answers;
CREATE POLICY "Application answers: update own"
  ON public.application_answers FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Application answers: delete own" ON public.application_answers;
CREATE POLICY "Application answers: delete own"
  ON public.application_answers FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS set_application_answers_updated_at ON public.application_answers;
CREATE TRIGGER set_application_answers_updated_at
  BEFORE UPDATE ON public.application_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
