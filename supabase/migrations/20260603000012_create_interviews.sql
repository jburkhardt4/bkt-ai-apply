-- ============================================================
-- Migration: 20260603000012_create_interviews
-- Entity:    E-012 — interviews
-- Batch:     4 — Events, Emails, Interviews
-- Security:  user_id scoped; SELECT/INSERT/UPDATE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.interviews (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  application_id      uuid        NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  calendar_event_id   text,
  interview_type      text        NOT NULL
    CHECK (interview_type IN ('phone', 'video', 'onsite', 'panel')),
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer     CHECK (duration_minutes > 0),
  location_or_link    text,
  interviewer_names   text[]      NOT NULL DEFAULT '{}',
  status              text        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'complete', 'cancelled', 'rescheduled')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS interviews_user_id_idx         ON public.interviews (user_id);
CREATE INDEX IF NOT EXISTS interviews_application_id_idx  ON public.interviews (application_id);
CREATE INDEX IF NOT EXISTS interviews_scheduled_at_idx    ON public.interviews (scheduled_at);

-- Dedup by calendar event (nullable — manual interviews won't have one)
CREATE UNIQUE INDEX IF NOT EXISTS interviews_calendar_event_idx
  ON public.interviews (user_id, calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interviews: select own"
  ON public.interviews FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Interviews: insert own"
  ON public.interviews FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Interviews: update own"
  ON public.interviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy — interview history is permanent.
-- Status transitions ('cancelled', 'rescheduled') use UPDATE.
