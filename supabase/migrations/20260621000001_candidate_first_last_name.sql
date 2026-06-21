-- Add explicit first_name / last_name to candidate_profiles (ADR-013 / Master Field
-- Schema Part A). full_name stays (recomposed from first+last for combined-name ATS such
-- as Ashby/Lever). NOT NULL DEFAULT '' mirrors the existing identity columns
-- (full_name / preferred_name); existing rows backfill to '' and the app seeds the inputs
-- by splitting full_name on next load. RLS unchanged — columns on an already-RLS'd table,
-- the own-row policies cover every column. These fields are NOT sensitive (BR-156).
alter table public.candidate_profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name  text not null default '';
