-- ============================================================
-- Migration: 20260603000007_create_ai_scores
-- Entity:    E-009 — ai_scores
-- Batch:     3 — Documents and Applications
-- Security:  user_id scoped; SELECT/INSERT only; score range
--            CHECK constraints; reasoning_trace in jsonb
-- Thresholds: BR-020 (>=60 consider), BR-021 (>=80 auto-submit prep)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_scores (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  job_id              uuid        NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,

  -- CHK-002: score range 0–100 (all score columns)
  overall_score       integer     NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  skills_score        integer              CHECK (skills_score BETWEEN 0 AND 100),
  domain_score        integer              CHECK (domain_score BETWEEN 0 AND 100),
  seniority_score     integer              CHECK (seniority_score BETWEEN 0 AND 100),
  tools_score         integer              CHECK (tools_score BETWEEN 0 AND 100),
  location_auth_score integer              CHECK (location_auth_score BETWEEN 0 AND 100),

  -- Derived recommendation from signed-off thresholds
  -- BR-020: >=60 → 'consider'; BR-021: >=80 → 'apply'; <60 → 'reject'
  recommendation      text        NOT NULL
    CHECK (recommendation IN ('apply', 'consider', 'reject')),

  strengths           text[]      NOT NULL DEFAULT '{}',
  gaps                text[]      NOT NULL DEFAULT '{}',
  model_used          text        NOT NULL,
  reasoning_trace     jsonb       NOT NULL DEFAULT '{}',
  scored_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ai_scores_user_id_idx   ON public.ai_scores (user_id);
CREATE INDEX IF NOT EXISTS ai_scores_job_id_idx    ON public.ai_scores (job_id);
CREATE INDEX IF NOT EXISTS ai_scores_scored_at_idx ON public.ai_scores (scored_at DESC);

-- Lookup: latest score per job per user
CREATE INDEX IF NOT EXISTS ai_scores_user_job_idx
  ON public.ai_scores (user_id, job_id, scored_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.ai_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI scores: select own"
  ON public.ai_scores FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "AI scores: insert own"
  ON public.ai_scores FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE policies — scores are immutable records.
-- Re-scoring creates a new row; history preserved.
