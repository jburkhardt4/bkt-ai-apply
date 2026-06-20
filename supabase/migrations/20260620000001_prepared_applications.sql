-- ============================================================
-- Migration: 20260620000001_prepared_applications
-- Phase 2b apply-macro — the "headless prep + human submit" data model
-- (research 2026-06-20, ADR-013). Two user-scoped, RLS-on tables:
--
--   1) prepared_applications        — one row per job-prep attempt. The server
--      PREP pipeline (read-only: it reads an ATS form schema via a public read
--      API and maps the user's profile onto it) writes these; it NEVER submits.
--      The MV3 extension (user's own session) hydrates the live DOM from the
--      mapped fields and the HUMAN clicks submit (BR-151).
--   2) prepared_application_fields  — one row per mapped field, carrying the
--      per-field value_source / confidence / sensitivity. HARD INVARIANT
--      (BR-156): a sensitive field (EEO/demographic, work-auth, salary, legal)
--      is ALWAYS review-gated and is never auto-filled.
--
-- Event sourcing note: prep does NOT write application_events. The events table
-- (E-010) is the immutable system-of-record for applications.stage transitions,
-- with closed event_type/actor CHECK sets; prep is a pre-application activity and
-- changes no stage. prepared_applications is self-auditing (status + gating_reason
-- + timestamps); the discovery->applied event is written by the existing submit
-- flow when the human actually submits.
--
-- Additive only + RLS-on (BR-001/005). Service role (the prep cron) bypasses RLS
-- to write rows for any user, exactly like the submission worker / previews
-- pattern. Applied to the hosted project via MCP apply_migration; this file is the
-- repo record (do NOT `supabase db push` — see remote-workflow notes).
-- ============================================================

-- 1) prepared_applications --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prepared_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nullable: a prep may precede the lifecycle applications row (it can be linked
  -- later when the user submits). ON DELETE SET NULL keeps the prep audit if the
  -- application row is later removed.
  application_id       uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  job_id               uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  -- { source_board, source_url, external_job_id } — the discovery provenance.
  job_ref              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ats_family           text NOT NULL DEFAULT 'other'
                         CHECK (ats_family IN ('greenhouse','lever','ashby','smartrecruiters','workday','other')),
  -- Anti-bot read tier exposed by the adapter; the prep pipeline gates Auto-mode
  -- on this (low only), never on a hard-coded platform name (research rec #3).
  antibot_tier         text NOT NULL DEFAULT 'unknown'
                         CHECK (antibot_tier IN ('low','medium','high','unknown')),
  -- Immutable raw detected schema at prep time (audit + drift detection).
  form_schema_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_score          numeric,
  mode                 text NOT NULL DEFAULT 'hybrid'
                         CHECK (mode IN ('auto','hybrid')),
  status               text NOT NULL DEFAULT 'prepared'
                         CHECK (status IN ('prepared','needs_review','ready_to_fill','submitted','stale','blocked')),
  -- Why a row landed in needs_review / blocked (sensitive gating, anti-bot tier,
  -- score gate, unsupported ATS, …). Null when cleanly prepared.
  gating_reason        text,
  -- FKs to the immutable resume / cover-letter document versions used for this prep.
  document_versions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_by          text NOT NULL DEFAULT 'on_demand'
                         CHECK (prepared_by IN ('cron','on_demand')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prepared_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prepared applications: select own" ON public.prepared_applications;
CREATE POLICY "Prepared applications: select own"
  ON public.prepared_applications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared applications: insert own" ON public.prepared_applications;
CREATE POLICY "Prepared applications: insert own"
  ON public.prepared_applications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared applications: update own" ON public.prepared_applications;
CREATE POLICY "Prepared applications: update own"
  ON public.prepared_applications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared applications: delete own" ON public.prepared_applications;
CREATE POLICY "Prepared applications: delete own"
  ON public.prepared_applications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER set_prepared_applications_updated_at
  BEFORE UPDATE ON public.prepared_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prepared_applications_user_status
  ON public.prepared_applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_prepared_applications_user_app
  ON public.prepared_applications (user_id, application_id);
-- Upsert key for re-prep of the same job (the common case has a job_id); the
-- URL-only case (job_id null) is left unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prepared_applications_user_job
  ON public.prepared_applications (user_id, job_id) WHERE job_id IS NOT NULL;

-- 2) prepared_application_fields --------------------------------------------
CREATE TABLE IF NOT EXISTS public.prepared_application_fields (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prepared_application_id uuid NOT NULL REFERENCES public.prepared_applications(id) ON DELETE CASCADE,
  -- Denormalized for a direct RLS predicate (avoids a join in the policy).
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key               text NOT NULL,
  field_label             text NOT NULL DEFAULT '',
  field_type              text NOT NULL DEFAULT 'text',
  -- Resolved value (string / boolean / choice) as jsonb; null when unmapped.
  mapped_value            jsonb,
  value_source            text NOT NULL DEFAULT 'default'
                            CHECK (value_source IN ('profile','derived','ai_draft','default')),
  confidence              numeric NOT NULL DEFAULT 0,
  -- Sensitive = demographic/EEO, work authorization, salary, legal attestation.
  is_sensitive            boolean NOT NULL DEFAULT false,
  review_gate             boolean NOT NULL DEFAULT false,
  free_text_draft         text,
  redaction_safe          boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- HARD INVARIANT (BR-156): a sensitive field is ALWAYS review-gated. The
  -- trigger below auto-forces review_gate=true on insert/update so a caller can
  -- never forget; this CHECK is the belt-and-suspenders guarantee even if the
  -- trigger is ever disabled.
  CONSTRAINT prepared_fields_sensitive_gated CHECK (NOT is_sensitive OR review_gate),
  UNIQUE (prepared_application_id, field_key)
);

-- Auto-force the review gate for sensitive fields (ergonomic half of BR-156).
CREATE OR REPLACE FUNCTION public.fn_prepared_field_force_gate()
  RETURNS trigger
  LANGUAGE plpgsql
  -- Empty search_path: the body references no schema objects (clears the
  -- function_search_path_mutable advisory).
  SET search_path = ''
AS $$
BEGIN
  IF NEW.is_sensitive THEN
    NEW.review_gate := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepared_field_force_gate
  BEFORE INSERT OR UPDATE ON public.prepared_application_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_prepared_field_force_gate();

ALTER TABLE public.prepared_application_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prepared fields: select own" ON public.prepared_application_fields;
CREATE POLICY "Prepared fields: select own"
  ON public.prepared_application_fields FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared fields: insert own" ON public.prepared_application_fields;
CREATE POLICY "Prepared fields: insert own"
  ON public.prepared_application_fields FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared fields: update own" ON public.prepared_application_fields;
CREATE POLICY "Prepared fields: update own"
  ON public.prepared_application_fields FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Prepared fields: delete own" ON public.prepared_application_fields;
CREATE POLICY "Prepared fields: delete own"
  ON public.prepared_application_fields FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER set_prepared_application_fields_updated_at
  BEFORE UPDATE ON public.prepared_application_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prepared_fields_prepared_app
  ON public.prepared_application_fields (prepared_application_id);
CREATE INDEX IF NOT EXISTS idx_prepared_fields_user
  ON public.prepared_application_fields (user_id);
