-- Migration: jobs_add_job_type
-- Purpose:  Capture SerpApi detected_extensions.schedule_type into the jobs table
--           so the Prospector "Job Search Results" UI can display Job Type
--           (Full-time | Contractor | Part-time | Internship).
--
-- Nullable by design: existing rows and any SerpApi result without a schedule_type
-- remain NULL. The prospector-cron Edge Function populates it on new discoveries
-- (mapJobResult: job_type = detected_extensions.schedule_type). Dedup on source_url
-- means previously-ingested rows keep NULL until re-discovered — acceptable.
--
-- Inherits the jobs table's existing RLS policies (user-scoped SELECT/INSERT/
-- UPDATE/DELETE on user_id = auth.uid()). No policy change required for an
-- additive nullable column. Run pnpm db:gen-types after applying.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_type text;
