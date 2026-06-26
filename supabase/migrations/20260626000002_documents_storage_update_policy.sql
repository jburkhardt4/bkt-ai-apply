-- Builder autosave overwrites the resume `.txt` in place via storage upsert,
-- which is an UPDATE on storage.objects. The documents bucket had INSERT/SELECT/
-- DELETE policies but NO UPDATE policy, so every in-place save was RLS-denied
-- ("new row violates row-level security policy", HTTP 400) and edits to an already
-- saved/uploaded resume silently failed to persist. Applied to the hosted project
-- via Supabase MCP apply_migration; this is the version-controlled record.

drop policy if exists "Documents bucket: update own files" on storage.objects;
create policy "Documents bucket: update own files"
  on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (auth.uid())::text);
