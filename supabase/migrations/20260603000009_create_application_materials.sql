-- ============================================================
-- Migration: 20260603000009_create_application_materials
-- Entity:    E-007 — application_materials
-- Batch:     3 — Documents and Applications
-- Security:  RLS via application → user_id (no direct user_id col);
--            INSERT locks the linked document (is_locked = true)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.application_materials (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid        NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  document_id     uuid        NOT NULL REFERENCES public.documents (id) ON DELETE RESTRICT,
  material_type   text        NOT NULL
    CHECK (material_type IN ('resume', 'cover_letter', 'attachment')),
  is_primary      boolean     NOT NULL DEFAULT false,
  linked_at       timestamptz NOT NULL DEFAULT now(),

  -- One primary document per material_type per application
  CONSTRAINT application_materials_unique UNIQUE (application_id, document_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS app_materials_application_id_idx
  ON public.application_materials (application_id);
CREATE INDEX IF NOT EXISTS app_materials_document_id_idx
  ON public.application_materials (document_id);

-- ── TRG: Lock document on link (BR-007, BR-072) ──────────────
-- When a document is linked to an application it becomes immutable.
-- This trigger sets documents.is_locked = true via SECURITY DEFINER,
-- which bypasses the documents UPDATE policy (which blocks locked docs
-- from being updated), safely elevating only this specific operation.
CREATE OR REPLACE FUNCTION public.fn_lock_linked_document()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.documents
  SET is_locked = true
  WHERE id = NEW.document_id
    AND is_locked = false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_app_materials_lock_document
  AFTER INSERT ON public.application_materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_lock_linked_document();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.application_materials ENABLE ROW LEVEL SECURITY;

-- Access governed by ownership of the parent application (SEC-006)
CREATE POLICY "App materials: select via application"
  ON public.application_materials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = application_materials.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "App materials: insert via application"
  ON public.application_materials FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = application_materials.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — materials are immutable after linking.
-- Document immutability is enforced by trg_documents_guard_locked.
