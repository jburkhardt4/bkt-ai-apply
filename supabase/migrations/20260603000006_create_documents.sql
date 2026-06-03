-- ============================================================
-- Migration: 20260603000006_create_documents
-- Entity:    E-008 — documents
-- Batch:     3 — Documents and Applications
-- Security:  user_id scoped; NO DELETE policy; immutable after
--            is_locked=true (TRG-001); versioned per user+type
-- ============================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  storage_path   text        NOT NULL,
  document_type  text        NOT NULL CHECK (document_type IN ('resume', 'cover_letter')),
  version        integer     NOT NULL DEFAULT 1,
  content_hash   text        NOT NULL,
  is_locked      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Unique version per user per document type (BR-070)
  CONSTRAINT documents_user_type_version_unique UNIQUE (user_id, document_type, version)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS documents_user_id_idx    ON public.documents (user_id);
CREATE INDEX IF NOT EXISTS documents_type_idx       ON public.documents (user_id, document_type, version DESC);

-- Content-hash index for deduplication checks
CREATE INDEX IF NOT EXISTS documents_hash_idx       ON public.documents (content_hash);

-- ── TRG-001: Prevent mutation of locked documents ────────────
-- Once is_locked=true, no further updates are permitted (BR-007).
-- The lock is set via service-role (application_materials insert
-- flow) — never by the client directly.
CREATE OR REPLACE FUNCTION public.fn_guard_locked_document()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION
      'document_immutable: document id=% is locked and cannot be modified',
      OLD.id
    USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_guard_locked
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_locked_document();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Documents: select own"
  ON public.documents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Documents: insert own"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE allowed only for unlocked documents (client can update
-- content before linking; trigger blocks if already locked).
CREATE POLICY "Documents: update own unlocked"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_locked = false)
  WITH CHECK (user_id = auth.uid());

-- NO DELETE policy — documents are never deleted by the client.
-- PRIV-001 purge is handled by service-role data-deletion function only.
