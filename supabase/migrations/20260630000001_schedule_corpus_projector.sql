-- ============================================================
-- Migration: 20260630000001_schedule_corpus_projector
-- Feature:   Schedule the corpus projector via pg_cron (ADR-019 #5 follow-up)
--
-- WHY: project_corpus_all() was deployed 2026-06-22 but never scheduled, so the
-- shared job_postings corpus (refreshed every 6h by crawler-discover/worker) was
-- not flowing into per-user `jobs`. Only 15 source='corpus' rows exist, all from
-- the one-off 2026-06-22 run. This wires the recurring projection.
--
-- DESIGN: call the in-DB RPC directly from pg_cron — NO edge-function hop and NO
-- CRON_SECRET. The corpus-projector edge function is only a thin wrapper around
-- public.project_corpus_all(); its work is pure in-DB SQL, so there is no reason
-- to round-trip through HTTP. Because no secret is inlined, this is safe to commit
-- as a migration (unlike the crawler-discover/worker crons, which use net.http_post
-- with an inlined CRON_SECRET and were therefore scheduled out-of-band via MCP).
--
-- SECURITY: project_corpus_all is SECURITY DEFINER, owned by postgres. pg_cron runs
-- jobs as the scheduling role (postgres), which owns the function — so the grant
-- (service_role only) is irrelevant to the cron path; postgres executes its own
-- definer function. user_id is set to profile.user_id inside the RPC, satisfying
-- the jobs RLS WITH CHECK. The user-scoped jobs table + RLS are UNTOUCHED.
--
-- CADENCE: 20 min past each 6-hour discover cycle (00:20, 06:20, 12:20, 18:20 UTC),
-- after crawler-worker has drained the queue, so projection sees the fresh corpus.
-- Corpus only changes every 6h, so a tighter cadence would mostly re-scan unchanged
-- data. To lower new-profile latency instead, switch to hourly ('17 * * * *').
--
-- LIMIT: 25 matches per profile (the RPC default). Note: the RPC takes the top-25
-- by ts_rank then dedups on source_url, so with >25 eligible only the top 25 ever
-- land. Raise the arg (max 100) if deeper projection per profile is wanted.
--
-- APPLY: via MCP apply_migration only (repo record). Do NOT `db push` — the hosted
-- migration registry has MCP-applied entries not present as local files; a push
-- would replay/conflict (see supabase-remote-workflow notes).
-- Idempotent: safe to re-apply (unschedules the prior job before re-scheduling).
-- ============================================================

-- pg_cron is already enabled on the hosted project; this is a no-op guard that
-- documents the dependency for fresh rebuilds.
create extension if not exists pg_cron;

-- Idempotent re-apply: drop any existing schedule with this name before re-adding.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'corpus-project-6h') then
    perform cron.unschedule('corpus-project-6h');
  end if;
end $$;

select cron.schedule(
  'corpus-project-6h',
  '20 */6 * * *',
  $cron$ select public.project_corpus_all(25); $cron$
);
