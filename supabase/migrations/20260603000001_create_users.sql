-- ============================================================
-- Migration: 20260603000001_create_users
-- Entity:    E-001 — users
-- Batch:     1 — Foundation
-- Security:  RLS own-row-only; auto-provision on auth.users INSERT
-- ============================================================

-- ── Shared helper: set updated_at on every UPDATE ───────────
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON public.users (email);

-- ── Trigger: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SEC-001: RLS on; SEC-006: own row only
CREATE POLICY "Users: select own row"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users: update own row"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT policy for clients — provisioned via trigger below
-- No DELETE policy — user deletion goes through Supabase Auth

-- ── Auto-provision trigger from auth.users ───────────────────
-- Creates public.users row (and default 'applicant' role) on
-- first Google OAuth sign-in. SECURITY DEFINER bypasses RLS
-- for the insert only; no service-role key required client-side.
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user();
