-- Migration: jobs_add_description_formatted
-- Purpose:  Store an LLM-normalized, clean-Markdown version of each job's raw
--           scraped description so the Prospector JD sidebar renders a uniform,
--           on-brand layout instead of the messy source text. Formatting happens
--           ONCE at job-creation time (prospector-cron, via Claude 3.5 Haiku) and
--           is cached here; the UI reads this column and only falls back to the
--           raw `description` when it is NULL (e.g. rows discovered before this
--           column existed, which are backfilled lazily on first view).
--
-- Nullable by design: existing rows and any job whose formatting failed/queued
-- remain NULL and render the raw `description`. Dedup on source_url means
-- previously-ingested rows keep NULL until backfilled — acceptable.
--
-- Inherits the jobs table's existing RLS policies (user-scoped SELECT/INSERT/
-- UPDATE/DELETE on user_id = auth.uid()). No policy change required for an
-- additive nullable column. Run pnpm db:gen-types after applying.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS description_formatted text;
