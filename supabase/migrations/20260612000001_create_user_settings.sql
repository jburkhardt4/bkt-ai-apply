-- ============================================================
-- Migration: 20260612000001_create_user_settings
-- Entity:    E-016 — user_settings (ADR-006)
-- Batch:     6 — Auto-submission foundation
-- Security:  one row per user; RLS own-row select/insert/update;
--            server-side guardrail source of truth (BR-131);
--            auto-provisioned on public.users INSERT
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id                     uuid        PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  -- Defaults mirror the redesigned surface's seeded state (state.ts / JOBS_SEED)
  credits                     integer     NOT NULL DEFAULT 141 CHECK (credits >= 0),
  -- Budget bounds match the BudgetModal validation ($20–$5,000)
  monthly_budget_usd          integer     NOT NULL DEFAULT 240 CHECK (monthly_budget_usd BETWEEN 20 AND 5000),
  -- BR-130: autonomy level
  review_mode                 text        NOT NULL DEFAULT 'review'
    CHECK (review_mode IN ('review', 'assist', 'auto')),
  -- BR-132: kill switch — worker submits nothing while true
  paused                      boolean     NOT NULL DEFAULT false,
  -- BR-131 guardrails (server-enforced; defaults per ADR-006 / BR-021)
  auto_submit_score_threshold integer     NOT NULL DEFAULT 80 CHECK (auto_submit_score_threshold BETWEEN 0 AND 100),
  daily_submission_cap        integer     NOT NULL DEFAULT 10 CHECK (daily_submission_cap BETWEEN 1 AND 50),
  -- Doc auto-align target (SearchJob snapshot); Phase 2 swap from localStorage
  last_target_job             jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ── Trigger: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User settings: select own"
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "User settings: insert own"
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "User settings: update own"
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No DELETE policy — settings rows live and die with the user (FK CASCADE).

-- ── Backfill + auto-provision ────────────────────────────────
-- Existing users get a defaults row now; future users get one on insert.
INSERT INTO public.user_settings (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- Trigger-return functions are not callable via the Data API; SECURITY DEFINER
-- (search_path pinned) mirrors fn_handle_new_user so the insert bypasses RLS.
CREATE OR REPLACE FUNCTION public.fn_provision_user_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_provision_settings
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_provision_user_settings();

-- Trigger firing does not require caller EXECUTE; keep the SECURITY DEFINER
-- function off the Data API surface (linter 0028/0029).
REVOKE EXECUTE ON FUNCTION public.fn_provision_user_settings() FROM PUBLIC, anon, authenticated;
