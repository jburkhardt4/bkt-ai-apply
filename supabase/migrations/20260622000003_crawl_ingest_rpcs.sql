-- ============================================================
-- Migration: 20260622000003_crawl_ingest_rpcs
-- Feature:   ATS crawler ingest + queue-ops RPCs (ADR-015, Phase 3)
-- RPCs (all service-role only, mirroring 20260613000004_submission_worker_rpcs):
--   * consume_crawl_token(host, rps, burst)        — per-host token bucket
--   * upsert_job_postings(board_id, rows jsonb)     — no-churn upsert + snapshot
--   * close_missing_job_postings(board_id, seen[])  — set-difference close
--   * enqueue_due_crawl_jobs(stale_after, max)      — enqueue list_sync work
--
-- The crawler-worker / crawler-discover Edge Functions are thin orchestrators
-- over these RPCs; the heavy atomic DB logic lives here (SECURITY DEFINER,
-- search_path pinned, EXECUTE granted ONLY to service_role). content_hash is
-- computed in SQL (pgcrypto extensions.digest) so the pure TS layer stays
-- sync + vitest-testable and the hash has a single source of truth.
--
-- Additive only. Applied via MCP apply_migration; repo record (no `db push`).
-- ============================================================

-- ── consume_crawl_token ─────────────────────────────────────
-- Atomic token-bucket politeness gate (ADR-015 Decision 4). Refills by elapsed
-- time * rps (capped at burst), then consumes one token. Returns true if a
-- token was available (caller may fetch), false otherwise (caller reschedules).
-- The ON CONFLICT DO UPDATE row lock serializes concurrent callers per host.
CREATE OR REPLACE FUNCTION public.consume_crawl_token(
  p_host  text,
  p_rps   numeric DEFAULT 1,
  p_burst numeric DEFAULT 5
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_tokens numeric;
BEGIN
  INSERT INTO public.crawl_host_buckets (host, tokens, rps, last_refill)
  VALUES (p_host, p_burst, p_rps, now())
  ON CONFLICT (host) DO UPDATE
    SET tokens = least(
          p_burst,
          public.crawl_host_buckets.tokens
            + extract(epoch FROM (now() - public.crawl_host_buckets.last_refill))
              * public.crawl_host_buckets.rps
        ),
        last_refill = now()
  RETURNING tokens INTO v_tokens;

  IF v_tokens >= 1 THEN
    UPDATE public.crawl_host_buckets SET tokens = tokens - 1 WHERE host = p_host;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.consume_crawl_token(text, numeric, numeric) IS
  'ADR-015: service-role-only per-host token bucket. Refills by elapsed*rps (capped at burst), consumes one token, returns whether a token was available. Serialized per host by the upsert row lock.';

REVOKE EXECUTE ON FUNCTION public.consume_crawl_token(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_crawl_token(text, numeric, numeric) TO service_role;

-- ── upsert_job_postings ─────────────────────────────────────
-- No-churn upsert of normalized postings (ADR-015 Decision 6). For each row:
--   * compute content_hash = sha256 of the canonical subset (title,
--     description_text, location_raw, salary_min/max, employment_type, department);
--   * INSERT when new; UPDATE all columns when the hash changed; otherwise only
--     bump last_seen_at (and clear closed_at) — no updated_at churn, no snapshot.
--   * append a job_posting_snapshots row ONLY on insert or change (bounds the
--     append-only audit table to actual distinct versions).
-- board_id is the TRUSTED param (not read from the row) and ats_family is taken
-- from the board, so a row can never write to another board/family.
-- Returns {inserted, updated, unchanged, skipped}.
CREATE OR REPLACE FUNCTION public.upsert_job_postings(
  p_board_id uuid,
  p_rows     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_family    text;
  v_row       jsonb;
  v_ext       text;
  v_title     text;
  v_appurl    text;
  v_canon     text;
  v_hash      text;
  v_existing  text;
  v_changed   boolean;
  v_inserted  integer := 0;
  v_updated   integer := 0;
  v_unchanged integer := 0;
  v_skipped   integer := 0;
BEGIN
  SELECT ats_family INTO v_family FROM public.ats_boards WHERE id = p_board_id;
  IF v_family IS NULL THEN
    RETURN jsonb_build_object('error', 'unknown_board');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    v_ext    := v_row->>'external_job_id';
    v_title  := v_row->>'title';
    v_appurl := v_row->>'application_url';

    -- Defensive: a posting without an identity, title, or apply URL is unusable.
    IF v_ext IS NULL OR v_title IS NULL OR v_appurl IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_canon :=
         coalesce(v_title, '')                       || E'\x1f' ||
         coalesce(v_row->>'description_text', '')     || E'\x1f' ||
         coalesce(v_row->>'location_raw', '')         || E'\x1f' ||
         coalesce(v_row->>'salary_min', '')           || E'\x1f' ||
         coalesce(v_row->>'salary_max', '')           || E'\x1f' ||
         coalesce(v_row->>'employment_type', '')      || E'\x1f' ||
         coalesce(v_row->>'department', '');
    v_hash := encode(extensions.digest(v_canon, 'sha256'), 'hex');

    SELECT content_hash INTO v_existing
      FROM public.job_postings
     WHERE ats_family = v_family AND board_id = p_board_id AND external_job_id = v_ext;

    IF v_existing IS NULL THEN
      INSERT INTO public.job_postings (
        board_id, ats_family, external_job_id, company_name, title, location_raw,
        remote_type, department, team, employment_type, description_html,
        description_text, application_url, external_url, salary_min, salary_max,
        salary_currency, salary_interval, posted_at, content_hash
      ) VALUES (
        p_board_id, v_family, v_ext,
        v_row->>'company_name', v_title, v_row->>'location_raw',
        v_row->>'remote_type', v_row->>'department', v_row->>'team',
        v_row->>'employment_type', v_row->>'description_html',
        v_row->>'description_text', v_appurl, v_row->>'external_url',
        nullif(v_row->>'salary_min','')::integer, nullif(v_row->>'salary_max','')::integer,
        v_row->>'salary_currency', v_row->>'salary_interval',
        nullif(v_row->>'posted_at','')::timestamptz, v_hash
      );
      v_inserted := v_inserted + 1;
      v_changed := true;

    ELSIF v_existing IS DISTINCT FROM v_hash THEN
      UPDATE public.job_postings SET
        company_name    = v_row->>'company_name',
        title           = v_title,
        location_raw    = v_row->>'location_raw',
        remote_type     = v_row->>'remote_type',
        department      = v_row->>'department',
        team            = v_row->>'team',
        employment_type = v_row->>'employment_type',
        description_html = v_row->>'description_html',
        description_text = v_row->>'description_text',
        application_url = v_appurl,
        external_url    = v_row->>'external_url',
        salary_min      = nullif(v_row->>'salary_min','')::integer,
        salary_max      = nullif(v_row->>'salary_max','')::integer,
        salary_currency = v_row->>'salary_currency',
        salary_interval = v_row->>'salary_interval',
        posted_at       = nullif(v_row->>'posted_at','')::timestamptz,
        content_hash    = v_hash,
        last_seen_at    = now(),
        closed_at       = NULL
      WHERE ats_family = v_family AND board_id = p_board_id AND external_job_id = v_ext;
      v_updated := v_updated + 1;
      v_changed := true;

    ELSE
      -- Unchanged: cheap liveness touch only (no updated_at churn).
      UPDATE public.job_postings
         SET last_seen_at = now(), closed_at = NULL
       WHERE ats_family = v_family AND board_id = p_board_id AND external_job_id = v_ext;
      v_unchanged := v_unchanged + 1;
      v_changed := false;
    END IF;

    IF v_changed THEN
      INSERT INTO public.job_posting_snapshots (board_id, external_job_id, raw_payload, content_hash)
      VALUES (p_board_id, v_ext, v_row, v_hash);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'unchanged', v_unchanged, 'skipped', v_skipped
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_job_postings(uuid, jsonb) IS
  'ADR-015: service-role-only. No-churn upsert of normalized postings into job_postings (content_hash computed in SQL); snapshots on insert/change only. board_id trusted, ats_family from the board. Returns {inserted,updated,unchanged,skipped}.';

REVOKE EXECUTE ON FUNCTION public.upsert_job_postings(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_job_postings(uuid, jsonb) TO service_role;

-- ── close_missing_job_postings ──────────────────────────────
-- Set-difference close detection (ADR-015 Decision 6): mark active postings on a
-- board that were absent from a FULL successful enumeration as closed. The worker
-- calls this ONLY when the crawl status is 'ok' (never on partial/blocked), so a
-- truncated fetch can never false-close. p_seen NULL is a no-op safety guard.
CREATE OR REPLACE FUNCTION public.close_missing_job_postings(
  p_board_id uuid,
  p_seen     text[]
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_seen IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.job_postings
     SET closed_at = now()
   WHERE board_id = p_board_id
     AND closed_at IS NULL
     AND NOT (external_job_id = ANY (p_seen));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.close_missing_job_postings(uuid, text[]) IS
  'ADR-015: service-role-only. Marks active job_postings on a board absent from a full enumeration (p_seen) as closed. Caller must invoke only on a fully successful crawl. Returns count closed.';

REVOKE EXECUTE ON FUNCTION public.close_missing_job_postings(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.close_missing_job_postings(uuid, text[]) TO service_role;

-- ── enqueue_due_crawl_jobs ──────────────────────────────────
-- crawler-discover's enqueue step: insert a 'list_sync' crawl_job for each active
-- board that is stale (never synced or older than p_stale_after) AND has no open
-- (pending/running) job, oldest-first, bounded by p_max. Returns count enqueued.
CREATE OR REPLACE FUNCTION public.enqueue_due_crawl_jobs(
  p_stale_after interval DEFAULT interval '6 hours',
  p_max         integer  DEFAULT 100
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    SELECT b.id
      FROM public.ats_boards b
     WHERE b.is_active = true
       AND (b.last_synced_at IS NULL OR b.last_synced_at < now() - p_stale_after)
       AND NOT EXISTS (
         SELECT 1 FROM public.crawl_jobs q
          WHERE q.board_id = b.id AND q.status IN ('pending','running')
       )
     ORDER BY b.last_synced_at NULLS FIRST
     LIMIT GREATEST(p_max, 0)
  ),
  ins AS (
    INSERT INTO public.crawl_jobs (board_id, job_type, status)
    SELECT id, 'list_sync', 'pending' FROM due
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.enqueue_due_crawl_jobs(interval, integer) IS
  'ADR-015: service-role-only. Enqueues a list_sync crawl_job for each active, stale board with no open job (oldest-first, bounded). Returns count enqueued.';

REVOKE EXECUTE ON FUNCTION public.enqueue_due_crawl_jobs(interval, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_due_crawl_jobs(interval, integer) TO service_role;
