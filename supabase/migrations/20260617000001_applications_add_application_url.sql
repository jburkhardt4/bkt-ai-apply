-- Migration: applications_add_application_url
-- Purpose:  Track the job-board URL where an application was submitted, so the
--           upcoming "View Application" button (Phase B) can open the listing
--           the user applied to. Today the board URL only lives on `jobs.source_url`
--           (the generic posting); storing it on the application lets the link
--           survive job re-ingestion / source_url edits and lets us later
--           distinguish "where I applied" from "the posting".
--
-- Phase A scope (infrastructure only): add the column and backfill existing rows
-- from the joined job's source_url. Capture-at-apply-time is DEFERRED — this
-- migration intentionally does NOT touch the in-flight manual-apply handler
-- (Phase 1/2a territory). The handler will be wired to stamp application_url in a
-- later phase; until then the read path falls back to jobs.source_url.
--
-- Nullable by design: rows whose job has no source_url (none today — jobs.source_url
-- is NOT NULL) or future rows before capture is wired remain NULL and the UI reads
-- `application_url ?? jobs.source_url`.
--
-- Inherits the applications table's existing RLS policies (user-scoped on
-- user_id = auth.uid()). No policy change required for an additive nullable column.
-- Run pnpm db:gen-types (or the Supabase MCP types flow) after applying.

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS application_url text;

-- Backfill from the linked job's posting URL. Idempotent: only fills rows still
-- NULL, so re-running is safe and a later capture path won't be overwritten.
UPDATE public.applications a
SET application_url = j.source_url
FROM public.jobs j
WHERE a.job_id = j.id
  AND a.application_url IS NULL;
