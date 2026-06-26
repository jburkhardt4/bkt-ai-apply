-- Phase 1 — Resume library: store the ACTUAL uploaded file + builder config, and
-- make delete work. Applied to the hosted project via Supabase MCP apply_migration;
-- this file is the version-controlled record (see docs/adr / business-rules BR-165).
--
-- Root cause of the "trash button does nothing": the documents table and the
-- documents storage bucket had INSERT/SELECT/UPDATE policies but NO DELETE policy,
-- so RLS silently denied every delete.

alter table public.documents
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists original_path text,
  add column if not exists builder_config jsonb;

-- DELETE policy on the row (RLS-scoped to the owner).
drop policy if exists "Documents: delete own" on public.documents;
create policy "Documents: delete own"
  on public.documents for delete
  using (user_id = auth.uid());

-- DELETE policy on the storage object — mirrors the existing insert/select clause
-- (first path segment must be the caller's uid).
drop policy if exists "Documents bucket: delete own files" on storage.objects;
create policy "Documents bucket: delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
