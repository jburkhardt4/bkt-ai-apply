-- ============================================================
-- Migration: 20260618000001_claim_submission_mode_floors
-- Entity:    Phase 4 submission worker — mode-specific auto-submit floors
-- Batch:     6b — Application-Behaviour alignment (server-side guardrails)
--
-- Purpose:   Make the SERVER-AUTHORITATIVE autonomous-submission floor in
--            claim_submission MODE-SPECIFIC, mirroring the Application-Behaviour
--            contract surfaced in the UI (BR-130):
--              - auto   → submits everything that graduated into the pipeline
--                         (match_score >= 60 / READY_QUEUE_MIN_SCORE / BR-020)
--              - assist → submits high-fit roles only
--                         (match_score >= user_settings.auto_submit_score_threshold)
--              - review → never autonomous; explicit approval event required
--
--            Previously BOTH assist and auto required match_score >=
--            auto_submit_score_threshold (a single 80 floor for both). This
--            change is the ONLY behavioural delta — every other guardrail
--            (ownership, pause, credits, daily cap, monthly budget, no-resubmit,
--            explicit-approval path) is reproduced verbatim. Idempotent: a plain
--            CREATE OR REPLACE of the one function, with its grants/comment
--            re-issued. RLS stays ENABLED; no policy is touched.
--
-- Access:    SECURITY DEFINER, search_path pinned to (public, pg_temp), EXECUTE
--            granted ONLY to service_role (BR-131) — unchanged from the original.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_submission(p_queue_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue          public.application_queue%ROWTYPE;
  v_user_id        uuid;
  v_application_id uuid;
  v_queued_by      text;

  v_paused         boolean;
  v_credits        integer;
  v_daily_cap      integer;
  v_threshold      integer;
  v_review_mode    text;

  v_match_score    integer;
  v_submitted_at   timestamptz;

  v_application_method text;
  v_source_url     text;
  v_job_id         uuid;

  v_submitted_24h  integer;
  v_monthly_budget integer;
  v_submitted_month integer;

  v_has_approval   boolean;
  v_autonomous_ok  boolean;
BEGIN
  -- Lock the queue row so two worker invocations cannot double-claim it.
  SELECT *
    INTO v_queue
    FROM public.application_queue
   WHERE id = p_queue_id
   FOR UPDATE;

  -- Missing row or not in the claimable state -> no mutation.
  IF NOT FOUND OR v_queue.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;

  v_user_id        := v_queue.user_id;
  v_application_id := v_queue.application_id;
  v_queued_by      := v_queue.queued_by;  -- audit-only; never an authorization input (BR-131/148)

  -- FIX 3 / BR-136: serialize concurrent claims for THIS user so two
  -- overlapping worker runs cannot both pass the daily-cap / credit checks
  -- against the same balance. Transaction-scoped: released at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext('submission_claim:' || v_user_id::text));

  -- Load server-authoritative guardrail settings (BR-131), including the
  -- authoritative autonomy level (review_mode) — never trust the client.
  SELECT us.paused, us.credits, us.daily_submission_cap,
         us.auto_submit_score_threshold, us.review_mode,
         us.monthly_budget_usd
    INTO v_paused, v_credits, v_daily_cap, v_threshold, v_review_mode,
         v_monthly_budget
    FROM public.user_settings us
   WHERE us.user_id = v_user_id;

  -- Defensive: if no settings row exists, treat as not claimable rather
  -- than silently submitting with unknown guardrails.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;

  -- FIX 2 / BR-005: load application + its job, ENFORCING ownership — both
  -- the application AND the job must belong to the queue row's user_id. A
  -- mismatch on either (or a missing row) is never submitted and never charged.
  -- FIX 7: j.user_id = v_user_id prevents a client who knows a foreign job UUID
  -- from having the worker submit using that other user's source_url.
  SELECT a.match_score, a.submitted_at, a.job_id, j.application_method, j.source_url
    INTO v_match_score, v_submitted_at, v_job_id, v_application_method, v_source_url
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id AND j.user_id = v_user_id
   WHERE a.id = v_application_id
     AND a.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owned');
  END IF;

  -- ── Guardrails, in order ───────────────────────────────────
  -- BR-132 kill switch: transient, leave 'approved' for retry once unpaused.
  IF v_paused THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paused');
  END IF;

  -- BR-136 credits: transient, leave 'approved' until replenished.
  IF v_credits < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_credits');
  END IF;

  -- Daily cap (FIX 3): count this user's submissions AND in-flight claims in
  -- the rolling 24h window. Counting 'submitting' rows closes the overlapping-
  -- run race where two claims could each pass the cap before either confirms.
  -- Transient, leave 'approved' so it can fire after the window rolls.
  SELECT count(*)
    INTO v_submitted_24h
    FROM public.application_queue q
   WHERE q.user_id = v_user_id
     AND (
       (q.status = 'submitted'  AND q.submitted_at    >= now() - interval '24 hours')
       OR
       (q.status = 'submitting' AND q.last_attempt_at >= now() - interval '24 hours')
     );

  IF v_submitted_24h >= v_daily_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap');
  END IF;

  -- Monthly budget check (FIX 8 / BR-131/BR-136): count this user's submissions
  -- (and in-flight 'submitting' claims) in the current calendar month against
  -- monthly_budget_usd (each submission = 1 credit = $1). Transient: leave the
  -- row 'approved' so it can fire once the month rolls over.
  SELECT count(*)
    INTO v_submitted_month
    FROM public.application_queue q
   WHERE q.user_id = v_user_id
     AND (
       (q.status = 'submitted'  AND q.submitted_at    >= date_trunc('month', now()))
       OR
       (q.status = 'submitting' AND q.last_attempt_at >= date_trunc('month', now()))
     );

  IF v_submitted_month >= v_monthly_budget THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'monthly_budget_exhausted');
  END IF;

  -- BR-135 no-resubmit: if the application already submitted, this row is
  -- terminal. jobs.source_url is UNIQUE so this also covers same-source dupes.
  IF v_submitted_at IS NOT NULL THEN
    UPDATE public.application_queue
       SET status     = 'cancelled',
           last_error = 'already_submitted',
           updated_at = now()
     WHERE id = p_queue_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_submitted');
  END IF;

  -- FIX 1 / BR-130/131/148: SERVER-AUTHORITATIVE submission authorization.
  -- The client-supplied queued_by is audit-only and NEVER an authorization
  -- input. A row may submit iff EITHER an explicit human approval exists OR
  -- the autonomous criteria hold under the server's own review_mode + score.
  --
  -- (a) Explicit human approval — written by approvePreparedPacket
  --     (event_type='approval'). Authorizes ANY review mode.
  v_has_approval := EXISTS (
    SELECT 1
      FROM public.application_events ev
     WHERE ev.application_id = v_application_id
       AND ev.user_id        = v_user_id
       AND ev.event_type     = 'approval'
  );

  -- (b) Autonomous eligibility — the server's review_mode + server-side
  --     match_score clears the MODE-SPECIFIC floor (Application-Behaviour
  --     contract, BR-130):
  --       auto   → match_score >= 60 (READY_QUEUE_MIN_SCORE / BR-020): Auto mode
  --                auto-submits EVERYTHING that graduated into the pipeline.
  --       assist → match_score >= auto_submit_score_threshold (Hybrid mode:
  --                high-fit roles only; queues the rest for explicit approval).
  --     review never satisfies this branch (explicit approval only).
  v_autonomous_ok := (
    v_match_score IS NOT NULL
    AND (
      (v_review_mode = 'auto'   AND v_match_score >= 60)
      OR
      (v_review_mode = 'assist' AND v_match_score >= v_threshold)
    )
  );

  -- Neither path authorizes submission yet: leave the row 'approved'
  -- (transient — a later approval event can authorize it). A below-floor
  -- row is NOT cancelled; it simply awaits approval.
  IF NOT (v_has_approval OR v_autonomous_ok) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'awaiting_approval');
  END IF;

  -- ── All guards pass: CHARGE + CLAIM atomically ─────────────
  -- BR-136: charge one credit at claim; finalize_submission refunds on failure
  -- so that only successful submissions ultimately consume a credit.
  UPDATE public.user_settings
     SET credits    = credits - 1,
         updated_at = now()
   WHERE user_id = v_user_id;

  UPDATE public.application_queue
     SET status          = 'submitting',
         attempts        = attempts + 1,
         last_attempt_at = now(),
         updated_at      = now()
   WHERE id = p_queue_id;

  RETURN jsonb_build_object(
    'ok',                 true,
    'application_id',     v_application_id,
    'job_id',             v_job_id,
    'source_url',         v_source_url,
    'application_method', v_application_method,
    'queued_by',          v_queued_by
  );
END;
$$;

COMMENT ON FUNCTION public.claim_submission(uuid) IS
  'ADR-006 / BR-005,130,131,132,135,136,148: service-role-only. Per-user advisory-locked. Re-validates autonomy guardrails server-side (ownership of application AND job, pause, credits, daily cap incl. in-flight, monthly budget incl. in-flight, no-resubmit) and authorizes submission ONLY via an explicit approval event OR server-side review_mode+score using MODE-SPECIFIC floors (auto >= 60 / BR-020, assist >= auto_submit_score_threshold; review never autonomous). Charges one credit and claims an approved application_queue row into submitting. Returns {ok,...}. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.claim_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_submission(uuid) TO service_role;
