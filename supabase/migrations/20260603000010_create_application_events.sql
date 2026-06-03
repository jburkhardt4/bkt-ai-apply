-- ============================================================
-- Migration: 20260603000010_create_application_events
-- Entity:    E-010 — application_events
-- Batch:     4 — Events, Emails, Interviews
-- Security:  APPEND-ONLY — SELECT/INSERT only; NO UPDATE, NO DELETE
--            policies at any role level (SEC-007, BR-003).
--            This is the immutable system-of-record for all state changes.
--            GDPR purge (PRIV-001) handled exclusively by a privileged
--            service-role stored procedure (not client-accessible).
-- ============================================================

-- ── RESOLVED NOTE (ADR-001 — Option A approved by JB, 2026-06-03) ──
-- PRIV-001 requires full purge of application_events on user deletion.
-- BR-003 requires application_events rows to NEVER be deleted.
-- Approved resolution: MVP anonymize-only.
--   * Client-facing RLS enforces no-delete (no DELETE policy).
--   * BEFORE DELETE trigger (fn_deny_application_event_mutation) blocks
--     deletion at DB level, even for service-role callers.
--   * GDPR erasure is satisfied by anonymizing PII fields in-place via a
--     dedicated service-role function (fn_gdpr_anonymise_user) — to be
--     implemented in a follow-up Feature-Dev task. Immutable audit
--     history is preserved (BR-003 / SEC-007).
--   * Full erasure (true row delete) is deferred to a Post-MVP ADR
--     before any multi-user launch.
-- See: docs/adr/001-gdpr-vs-event-immutability.md
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.application_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  application_id  uuid        NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  event_type      text        NOT NULL
    CHECK (event_type IN (
      'stage_transition',
      'score_override',
      'approval',
      'rejection',
      'email_classified',
      'interview_scheduled',
      'interview_complete',
      'offer_received',
      'submission_attempt',
      'document_linked',
      'note_added',
      'system_alert'
    )),
  from_stage      text        CHECK (from_stage IN (
      'discovery', 'applied', 'screening',
      'interview_scheduled', 'interview_complete',
      'offer', 'hired', 'rejected', 'ghosted'
    )),
  to_stage        text        CHECK (to_stage IN (
      'discovery', 'applied', 'screening',
      'interview_scheduled', 'interview_complete',
      'offer', 'hired', 'rejected', 'ghosted'
    )),
  -- actor identifies who/what caused the event (BR-023, PRIV-007)
  actor           text        NOT NULL
    CHECK (actor IN (
      'system',
      'system_trigger',
      'jb_manual',
      'gmail_scraper',
      'calendar_scraper',
      'claude-opus-4',
      'claude-sonnet-4-5',
      'gpt-4o',
      'gpt-5',
      'gemini-2-5-pro',
      'gemini-2-5-flash'
    )),
  reason          text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS app_events_user_id_idx
  ON public.application_events (user_id);
CREATE INDEX IF NOT EXISTS app_events_application_id_idx
  ON public.application_events (application_id);
CREATE INDEX IF NOT EXISTS app_events_event_type_idx
  ON public.application_events (event_type);
CREATE INDEX IF NOT EXISTS app_events_created_at_idx
  ON public.application_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_user_app_idx
  ON public.application_events (user_id, application_id, created_at DESC);

-- ── Immutability guard: block UPDATE and DELETE at DB level ──
-- Belt-and-suspenders: these triggers fire even if an RLS policy
-- were accidentally added later. They cannot be bypassed by client.
CREATE OR REPLACE FUNCTION public.fn_deny_application_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'application_events_immutable: rows in application_events may not be % (SEC-007, BR-003)',
    TG_OP
  USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_app_events_deny_update
  BEFORE UPDATE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_deny_application_event_mutation();

CREATE TRIGGER trg_app_events_deny_delete
  BEFORE DELETE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_deny_application_event_mutation();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App events: select own"
  ON public.application_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "App events: insert own"
  ON public.application_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- EXPLICITLY: no UPDATE policy, no DELETE policy.
-- fn_deny_application_event_mutation provides belt-and-suspenders
-- enforcement at trigger level, independent of RLS.
