-- ============================================================
-- Migration: 20260603000014_create_ai_model_usage
-- Entity:    E-014 — ai_model_usage
-- Batch:     5 — Operational
-- Security:  user_id scoped; SELECT/INSERT only;
--            CHK-003: cost >= 0; index for monthly aggregates
-- Cost rules: BR-050 ($75/mo cap), BR-051 (90% alert at $67.50),
--             BR-052 (hard cap enforcement in application layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid           NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  model_provider       text           NOT NULL
    CHECK (model_provider IN ('openai', 'anthropic', 'google')),
  model_name           text           NOT NULL,
  task_type            text           NOT NULL,
  tokens_in            integer        NOT NULL CHECK (tokens_in >= 0),
  tokens_out           integer        NOT NULL CHECK (tokens_out >= 0),
  -- CHK-003: cost must be non-negative
  estimated_cost_usd   numeric(10,6)  NOT NULL CHECK (estimated_cost_usd >= 0),
  -- Nullable: not all AI calls are tied to a specific application
  application_id       uuid           REFERENCES public.applications (id) ON DELETE SET NULL,
  called_at            timestamptz    NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Primary index for user-scoped monthly cost aggregate (BR-050, BR-051)
CREATE INDEX IF NOT EXISTS ai_usage_user_called_at_idx
  ON public.ai_model_usage (user_id, called_at DESC);

-- Composite index for monthly rollup queries:
-- SELECT SUM(estimated_cost_usd) WHERE user_id = ? AND called_at >= month_start
-- Note: date_trunc on timestamptz is STABLE (timezone-dependent); cast via
-- AT TIME ZONE 'UTC' to a plain timestamp so the expression is IMMUTABLE and
-- legal in an index. Monthly buckets are anchored to UTC.
CREATE INDEX IF NOT EXISTS ai_usage_monthly_cost_idx
  ON public.ai_model_usage (user_id, date_trunc('month', (called_at AT TIME ZONE 'UTC')), estimated_cost_usd);

CREATE INDEX IF NOT EXISTS ai_usage_provider_idx      ON public.ai_model_usage (model_provider);
CREATE INDEX IF NOT EXISTS ai_usage_task_type_idx     ON public.ai_model_usage (task_type);
CREATE INDEX IF NOT EXISTS ai_usage_application_id_idx ON public.ai_model_usage (application_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.ai_model_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI usage: select own"
  ON public.ai_model_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "AI usage: insert own"
  ON public.ai_model_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE or DELETE policies — usage records are immutable audit entries.
-- Monthly cost enforcement (BR-052) is applied at application layer before
-- each AI call; this table provides the authoritative cost history.
