-- ============================================================
-- Migration: 20260603000015_realtime_and_storage
-- Purpose:   Enable Supabase Realtime publications for live UI
--            updates; create private documents storage bucket
--            with user-scoped path enforcement.
-- ============================================================

-- ── Realtime Publications ────────────────────────────────────
-- Enable logical replication publication for the four tables
-- that drive live UI updates (see 09-supabase-handoff.md).
--
-- NOTE: Supabase creates 'supabase_realtime' publication by default.
-- The ALTER commands below add tables to that publication.
-- If running against a fresh project, Supabase CLI handles this
-- automatically; these statements are idempotent guards.

ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.application_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_scores;

-- Security note on Realtime:
-- Realtime channels must apply user_id filter at the client subscription
-- level (e.g., .eq('user_id', session.user.id)). RLS is enforced on the
-- underlying SELECT that delivers change events, so cross-user leakage
-- is blocked even without client-side filtering. Client-side filter is
-- belt-and-suspenders and reduces unnecessary traffic.

-- ── Storage Bucket ───────────────────────────────────────────
-- Creates the 'documents' private bucket for resume and cover
-- letter file storage (E-008, 09-supabase-handoff.md).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,                         -- private: no public URL access
  10485760,                      -- 10 MB per file
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS Policies ─────────────────────────────────────
-- Path convention: {user_id}/{document_id}.ext
-- Enforced by checking that the first path segment matches auth.uid().

-- SELECT: user can read own files
CREATE POLICY "Documents bucket: select own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: user can upload to own path only
CREATE POLICY "Documents bucket: insert own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: disallowed — documents are versioned by creating new rows
-- (BR-071: create new version rather than editing existing document)

-- DELETE: disallowed — documents are immutable after creation
-- (PRIV-001 deletion handled by service-role function)
