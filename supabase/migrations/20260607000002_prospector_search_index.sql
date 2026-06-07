-- Migration: prospector_search_index
-- Purpose:  Composite partial index to accelerate the Prospector "Job Search Results" query.
--
-- Optimized query (src/features/jobs/hooks/useProspectorSearchResults.ts):
--   SELECT ... FROM public.jobs
--   WHERE user_id = <auth.uid()> AND source = 'prospector'
--   ORDER BY created_at DESC
--   LIMIT 50;
--
-- The existing jobs_user_id_idx covers user_id alone but forces a sort for the
-- created_at DESC ordering and does not narrow on source. This partial index is
-- scoped to source = 'prospector' rows only (keeping it small) and stores
-- created_at DESC so the ordered, user-scoped fetch is served directly from the
-- index. Related rule: BR-105 (Ready/Search lists are scoped to source='prospector').
--
-- Safe + idempotent: IF NOT EXISTS guard; an index does not alter table shape,
-- so no db:gen-types run is required (BR-081 applies to schema/type changes only).

CREATE INDEX IF NOT EXISTS jobs_user_created_prospector_idx
  ON public.jobs (user_id, created_at DESC)
  WHERE source = 'prospector';
