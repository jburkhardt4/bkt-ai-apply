-- ============================================================
-- Migration: 20260603000002_create_roles
-- Entity:    E-002 — roles
-- Batch:     1 — Foundation
-- Security:  RLS own-rows SELECT only; INSERT by system trigger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('admin', 'applicant', 'ai_operator')),
  granted_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS roles_user_id_idx ON public.roles (user_id);

-- Prevent duplicate role assignments per user
CREATE UNIQUE INDEX IF NOT EXISTS roles_user_role_idx ON public.roles (user_id, role);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- SEC-001, SEC-006: own rows only; no client INSERT/UPDATE/DELETE
CREATE POLICY "Roles: select own rows"
  ON public.roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Role grants are performed by the fn_handle_new_user trigger
-- (SECURITY DEFINER) or by service-role Edge Functions only.

-- ── Backfill: assign default 'applicant' role via trigger ────
-- Extends fn_handle_new_user defined in migration 001.
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

  -- Default role assignment — service-level, never from client
  INSERT INTO public.roles (id, user_id, role, granted_at)
  VALUES (gen_random_uuid(), NEW.id, 'applicant', now())
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
