-- ============================================================
-- Migration: 20260612000004_create_application_queue
-- Entity:    E-019 — application_queue (ADR-006 / BR-133)
-- Batch:     6 — Auto-submission foundation
-- Security:  user_id scoped; client may select, queue (insert),
--            and approve/cancel (update own); the submission
--            worker (service role) owns submitting/submitted/
--            failed transitions. application_events remains the
--            source of truth (BR-133) — this table is workflow
--            state only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.application_queue (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- BR-133: one queue row per application, ever
  application_id   uuid        NOT NULL UNIQUE REFERENCES public.applications (id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'submitting', 'submitted', 'failed', 'cancelled')),
  -- BR-130: which autonomy path queued it
  queued_by        text        NOT NULL
    CHECK (queued_by IN ('user', 'assist_mode', 'auto_mode')),
  -- BR-134: resolved submission channel (null until the worker resolves it)
  channel          text
    CHECK (channel IN ('api', 'ats', 'browser', 'manual')),
  attempts         integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at  timestamptz,
  last_error       text,
  submitted_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS application_queue_user_id_idx ON public.application_queue (user_id);
-- Worker drain query: approved rows, oldest first
CREATE INDEX IF NOT EXISTS application_queue_status_idx
  ON public.application_queue (status, created_at)
  WHERE status IN ('approved', 'submitting');

-- ── Trigger: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_application_queue_updated_at
  BEFORE UPDATE ON public.application_queue
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.application_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application queue: select own"
  ON public.application_queue FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Clients queue with user-initiated statuses only; the worker's
-- lifecycle statuses (submitting/submitted/failed) are service-role-only.
CREATE POLICY "Application queue: insert own"
  ON public.application_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('pending_approval', 'approved')
  );

-- Approve / cancel own pending rows; in-flight and terminal rows are locked
-- to the worker (service role bypasses RLS).
CREATE POLICY "Application queue: update own pending"
  ON public.application_queue FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status IN ('pending_approval', 'approved')
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('pending_approval', 'approved', 'cancelled')
  );

-- No DELETE policy — cancelled rows are kept for audit context (BR-133).
