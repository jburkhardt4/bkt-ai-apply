-- ============================================================
-- Migration: 20260622000004_candidate_profiles_add_name_columns
-- Fix:       Backing record for candidate_profiles.first_name / last_name.
--
-- These two columns already exist in the hosted DB but had NO migration that
-- creates them (flagged in PR #29 review: the generated db.types.ts referenced
-- columns with no source-of-truth migration, breaking the "migrations are the
-- DB record" convention). This migration documents them so the repo, the DB,
-- and the generated types all agree.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes this a no-op on the live DB (the
-- columns are present) while becoming the correct record going forward. The
-- column shape mirrors the live schema exactly: text NOT NULL DEFAULT ''.
--
-- Additive only. Applied via MCP apply_migration; repo record (no `db push`).
-- ============================================================

ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  text NOT NULL DEFAULT '';
