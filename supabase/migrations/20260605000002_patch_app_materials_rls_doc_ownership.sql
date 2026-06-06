-- ============================================================
-- Migration: 20260605000002_patch_app_materials_rls_doc_ownership
-- Purpose:   Tighten application_materials INSERT RLS policy to
--            also verify that the linked document is owned by the
--            authenticated user.
--
-- Security finding: FINDING-SEC-P3-003
-- The original INSERT policy (migration 009) only checked that
-- the parent application belongs to auth.uid().  It did not check
-- that the document being linked also belongs to auth.uid().
-- An authenticated user who discovers another user's document UUID
-- could insert a materials row, causing trg_app_materials_lock_document
-- to set is_locked = true on the other user's document — a cross-user
-- state mutation that violates BR-005 (no cross-user data leakage).
--
-- Fix: Add an AND EXISTS clause that verifies documents.user_id =
-- auth.uid() in the WITH CHECK for the INSERT policy.
-- ============================================================

DROP POLICY IF EXISTS "App materials: insert via application"
  ON public.application_materials;

CREATE POLICY "App materials: insert via application"
  ON public.application_materials FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Application must belong to the authenticated user
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = application_materials.application_id
        AND applications.user_id = auth.uid()
    )
    -- Document being linked must also belong to the authenticated user (BR-005)
    AND EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = application_materials.document_id
        AND documents.user_id = auth.uid()
    )
  );
