-- ============================================================
-- Migration: 20260612000002_create_saved_jobs
-- Entity:    E-017 — saved_jobs (ADR-006 / redesign follow-up)
-- Batch:     6 — Auto-submission foundation
-- Security:  user_id scoped; select/insert/delete own (bookmarks
--            are user-managed, not audit data)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  job_id      uuid        NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One bookmark per job per user
  UNIQUE (user_id, job_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS saved_jobs_user_id_idx ON public.saved_jobs (user_id);
CREATE INDEX IF NOT EXISTS saved_jobs_job_id_idx  ON public.saved_jobs (job_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Saved jobs: select own"
  ON public.saved_jobs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Saved jobs: insert own"
  ON public.saved_jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Saved jobs: delete own"
  ON public.saved_jobs FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No UPDATE policy — a bookmark is created or removed, never mutated.
