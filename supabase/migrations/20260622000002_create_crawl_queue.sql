-- ============================================================
-- Migration: 20260622000002_create_crawl_queue
-- Feature:   ATS crawler task queue + rate-limit buckets (ADR-015)
-- Tables:    crawl_jobs, crawl_host_buckets
-- RPCs:      claim_crawl_jobs(), requeue_stale_crawl_jobs()  (service-role only)
--
-- A Postgres-native work queue for the crawler-worker Edge Function — no external
-- queue infra (ADR-015 Decision 1). Mirrors the submission worker's claim model
-- (20260613000004): FOR UPDATE SKIP LOCKED, SECURITY DEFINER, search_path pinned,
-- EXECUTE revoked from PUBLIC/anon/authenticated and granted ONLY to service_role.
--
-- These are operational (non-user, non-PII) tables: RLS ENABLED, authenticated
-- read-all for observability, writes service-role only (same posture as the
-- ADR-019 corpus tables). Depends on ats_boards (20260622000001).
--
-- Additive only. Applied to the hosted project via MCP apply_migration; this file
-- is the repo record (do NOT `supabase db push`).
-- ============================================================

-- 1) crawl_jobs — the work queue ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.crawl_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     uuid NOT NULL REFERENCES public.ats_boards(id) ON DELETE CASCADE,
  job_type     text NOT NULL DEFAULT 'list_sync'
                 CHECK (job_type IN ('discover','list_sync','workday_detail')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed','blocked')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {offset, facet, ...}
  attempts     integer NOT NULL DEFAULT 0,
  run_after    timestamptz NOT NULL DEFAULT now(),   -- backoff scheduling
  locked_until timestamptz,                          -- worker lease (claim sets this)
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Claimable queue: pending rows whose backoff window has opened, oldest first.
CREATE INDEX IF NOT EXISTS crawl_jobs_claimable_idx
  ON public.crawl_jobs (run_after) WHERE status = 'pending';
-- Self-heal scan for stale leases.
CREATE INDEX IF NOT EXISTS crawl_jobs_running_lease_idx
  ON public.crawl_jobs (locked_until) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS crawl_jobs_board_idx ON public.crawl_jobs (board_id);

CREATE TRIGGER set_crawl_jobs_updated_at
  BEFORE UPDATE ON public.crawl_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Crawl jobs: read all" ON public.crawl_jobs;
CREATE POLICY "Crawl jobs: read all"
  ON public.crawl_jobs FOR SELECT TO authenticated
  USING (true);
-- No write policy: service-role-only.

-- 2) crawl_host_buckets — per-host token bucket (politeness, ADR-015 Decision 4)
CREATE TABLE IF NOT EXISTS public.crawl_host_buckets (
  host        text PRIMARY KEY,
  tokens      numeric NOT NULL DEFAULT 0,
  rps         numeric NOT NULL DEFAULT 1,           -- conservative per-host refill rate
  last_refill timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crawl_host_buckets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Crawl host buckets: read all" ON public.crawl_host_buckets;
CREATE POLICY "Crawl host buckets: read all"
  ON public.crawl_host_buckets FOR SELECT TO authenticated
  USING (true);
-- No write policy: service-role-only.

-- ============================================================
-- claim_crawl_jobs(p_batch, p_lease) RETURNS setof crawl_jobs
--   Atomically claims up to p_batch pending, due rows for the calling worker:
--   leases them (status->running, locked_until=now()+p_lease, attempts+1) under
--   FOR UPDATE SKIP LOCKED so concurrent workers never double-claim. Returns the
--   claimed rows for the worker to process. Service-role only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_crawl_jobs(
  p_batch integer  DEFAULT 10,
  p_lease interval DEFAULT interval '5 minutes'
)
  RETURNS SETOF public.crawl_jobs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.crawl_jobs
     WHERE status = 'pending'
       AND run_after <= now()
     ORDER BY run_after
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(p_batch, 0)
  )
  UPDATE public.crawl_jobs q
     SET status       = 'running',
         attempts     = q.attempts + 1,
         locked_until = now() + p_lease,
         updated_at   = now()
    FROM claimable c
   WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

COMMENT ON FUNCTION public.claim_crawl_jobs(integer, interval) IS
  'ADR-015: service-role-only. Atomically claims up to p_batch due crawl_jobs (FOR UPDATE SKIP LOCKED), leasing them to the caller (status->running, locked_until, attempts+1). Returns the claimed rows. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.claim_crawl_jobs(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_crawl_jobs(integer, interval) TO service_role;

-- ============================================================
-- requeue_stale_crawl_jobs(p_grace) RETURNS integer
--   Self-heal after a crashed/timed-out worker: rows stuck in 'running' past
--   their lease are returned to 'pending' (with a short backoff) so the queue
--   does not stall. Returns the number of rows requeued. Service-role only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.requeue_stale_crawl_jobs(
  p_grace interval DEFAULT interval '0 minutes'
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT id
      FROM public.crawl_jobs
     WHERE status = 'running'
       AND locked_until IS NOT NULL
       AND locked_until < now() - p_grace
     FOR UPDATE SKIP LOCKED
  ),
  requeued AS (
    UPDATE public.crawl_jobs q
       SET status       = 'pending',
           locked_until = NULL,
           run_after    = now() + interval '1 minute',
           last_error   = 'lease_expired_requeued',
           updated_at   = now()
      FROM stale s
     WHERE q.id = s.id
    RETURNING q.id
  )
  SELECT count(*) INTO v_count FROM requeued;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.requeue_stale_crawl_jobs(interval) IS
  'ADR-015: service-role-only self-heal. Returns crawl_jobs stuck in running past their lease to pending (short backoff) so the queue does not stall. Returns count requeued. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.requeue_stale_crawl_jobs(interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.requeue_stale_crawl_jobs(interval) TO service_role;
