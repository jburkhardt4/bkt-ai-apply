-- ============================================================
-- Migration: 20260603000013_create_notifications
-- Entity:    E-013 — notifications
-- Batch:     5 — Operational
-- Security:  user_id scoped; SELECT/INSERT/UPDATE (mark-read)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- Nullable: some notifications are not tied to a specific application
  application_id      uuid        REFERENCES public.applications (id) ON DELETE SET NULL,
  notification_type   text        NOT NULL
    CHECK (notification_type IN (
      'approval_needed',
      'stage_change',
      'ai_signal',
      'cost_alert'
    )),
  title               text        NOT NULL,
  body                text,
  is_read             boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS notifications_user_id_idx        ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS notifications_application_id_idx ON public.notifications (application_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications: select own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Notifications: insert own"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE restricted to is_read flag only (mark-as-read pattern)
CREATE POLICY "Notifications: update own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy.
