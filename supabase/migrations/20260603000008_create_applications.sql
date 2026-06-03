-- ============================================================
-- Migration: 20260603000008_create_applications
-- Entity:    E-006 — applications
-- Batch:     3 — Documents and Applications
-- Security:  user_id scoped; SELECT/INSERT/UPDATE (no DELETE);
--            stage CHECK enum; updated_at trigger (TRG-002);
--            stage validation trigger (TRG-003)
-- Event sourcing: BR-002 — stage changes MUST write
--            application_events; enforced at application layer
--            (pipelineService.ts + stageRules.ts). DB trigger
--            provides safety-net insert with actor='system_trigger'
--            only when no app-layer event was written in the same
--            transaction (see fn_log_stage_transition comments).
-- ============================================================

-- Valid pipeline stages (BR-013, pipeline-stages spec)
-- Defined as a reusable domain type for clarity.
-- NOTE: Adding new stages requires a migration to ALTER TYPE or
-- update the CHECK constraint below.
CREATE TABLE IF NOT EXISTS public.applications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  job_id        uuid        NOT NULL REFERENCES public.jobs (id) ON DELETE RESTRICT,

  -- TRG-003 / stage enum validation
  stage         text        NOT NULL DEFAULT 'discovery'
    CHECK (stage IN (
      'discovery',
      'applied',
      'screening',
      'interview_scheduled',
      'interview_complete',
      'offer',
      'hired',
      'rejected',
      'ghosted'
    )),

  match_score   integer              CHECK (match_score BETWEEN 0 AND 100),
  submitted_at  timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One application per user per job
  CONSTRAINT applications_user_job_unique UNIQUE (user_id, job_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS applications_user_id_idx   ON public.applications (user_id);
CREATE INDEX IF NOT EXISTS applications_job_id_idx    ON public.applications (job_id);
CREATE INDEX IF NOT EXISTS applications_stage_idx     ON public.applications (user_id, stage);
CREATE INDEX IF NOT EXISTS applications_updated_at_idx ON public.applications (updated_at DESC);

-- ── TRG-002: updated_at maintenance ──────────────────────────
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── Stage-transition safety-net trigger ──────────────────────
-- BR-002: every stage change must produce an application_events row.
-- Primary enforcement: pipelineService.ts writes the event before update.
-- This trigger is a safety net that fires AFTER the stage update to
-- insert a minimal system event IF (and only if) no event for this
-- transition was written in the same transaction.
--
-- Implementation note: detecting "was an app-layer event written in
-- this txn?" reliably requires a session-local flag. We use a
-- pg_session variable pattern: app code sets
--   SET LOCAL app.stage_event_written = 'true'
-- before its INSERT into application_events. The trigger checks this
-- flag; if absent it inserts a fallback event.
CREATE OR REPLACE FUNCTION public.fn_log_stage_transition()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_flag text;
BEGIN
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Check whether app layer already wrote the event this transaction
  BEGIN
    v_flag := current_setting('app.stage_event_written', true);
  EXCEPTION WHEN OTHERS THEN
    v_flag := NULL;
  END;

  IF v_flag IS DISTINCT FROM 'true' THEN
    -- Safety-net: app layer missed writing the event
    INSERT INTO public.application_events (
      id, user_id, application_id, event_type,
      from_stage, to_stage, actor, reason, metadata, created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.user_id,
      NEW.id,
      'stage_transition',
      OLD.stage,
      NEW.stage,
      'system_trigger',
      'Fallback: app layer did not set app.stage_event_written',
      jsonb_build_object('trigger', 'fn_log_stage_transition', 'migration', '20260603000008'),
      now()
    );
  END IF;

  -- Reset flag so the next statement in the same connection starts clean
  PERFORM set_config('app.stage_event_written', 'false', true);
  RETURN NEW;
END;
$$;

-- Trigger runs AFTER update so application_events FK on application_id resolves
CREATE TRIGGER trg_applications_stage_transition
  AFTER UPDATE OF stage ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_stage_transition();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applications: select own"
  ON public.applications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Applications: insert own"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Applications: update own"
  ON public.applications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy — applications are permanently tracked records.
-- PRIV-001 deletion handled by privileged service-role function.
