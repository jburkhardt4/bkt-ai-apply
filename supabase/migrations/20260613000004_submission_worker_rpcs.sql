-- ============================================================
-- Migration: 20260613000004_submission_worker_rpcs
-- Entity:    Phase 4 submission worker RPCs (ADR-006 / BR-130..136)
-- Batch:     6 — Auto-submission foundation (server-side guardrails)
--
-- Purpose:   Three SECURITY DEFINER RPCs that let the (service-role)
--            submission worker atomically claim, guardrail-check,
--            charge, and finalize a queued submission. The worker is
--            the ONLY trusted decision point for autonomy (BR-131):
--            client state is never trusted for submission decisions.
--
-- Additive only — does NOT alter RLS on any existing table and does
-- NOT weaken any existing constraint. RLS stays enabled everywhere.
--
-- Access:    All three functions are SECURITY DEFINER, search_path
--            pinned to (public, pg_temp), and EXECUTE is revoked from
--            PUBLIC/anon/authenticated and granted ONLY to service_role
--            (BR-131). Clients can never call them; they reach the
--            queue exclusively through their own RLS-scoped writes.
--
-- Event sourcing (BR-002 / BR-133): every outcome writes an
--            application_events row with actor='system' and
--            event_type='submission_attempt' (both valid enum values).
--            The discovery -> applied transition (BR-135) writes one,
--            and only one, 'stage_transition' event.
--
-- NOTE on filename: the work brief specified 20260613000001, but that
--            timestamp is already taken by 20260613000001_create_gmail_label_map.
--            The next free slot after the latest existing 20260613000003
--            is 20260613000004 — used here to preserve lexical migration
--            order without a duplicate-name collision. Flagged in report.
-- ============================================================


-- ============================================================
-- 1) public.claim_submission(p_queue_id uuid) RETURNS jsonb
--
--    Atomically claims an 'approved' queue row for submission after
--    re-validating ALL autonomy guardrails server-side (BR-131) and
--    charging one credit (BR-136). On any guardrail failure, returns
--    { ok:false, reason:<code> } and either leaves the row 'approved'
--    (transient) or cancels it (terminal). On success, decrements the
--    credit and flips the row to 'submitting', then returns the payload
--    the worker needs to drive the channel adapter (BR-134).
--
--    Reason codes returned (ok:false):
--      not_claimable      row missing or not in 'approved' (no mutation)
--      paused             user_settings.paused = true       (stays approved) BR-132
--      no_credits         credits < 1                        (stays approved) BR-136
--      daily_cap          >= daily_submission_cap submitted in last 24h (stays approved)
--      already_submitted  applications.submitted_at set      (-> cancelled)  BR-135
--      below_threshold    autonomous + score < threshold     (-> cancelled)  BR-131
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

  v_match_score    integer;
  v_submitted_at   timestamptz;

  v_application_method text;
  v_source_url     text;
  v_job_id         uuid;

  v_submitted_24h  integer;
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
  v_queued_by      := v_queue.queued_by;

  -- Load server-authoritative guardrail settings (BR-131).
  SELECT us.paused, us.credits, us.daily_submission_cap, us.auto_submit_score_threshold
    INTO v_paused, v_credits, v_daily_cap, v_threshold
    FROM public.user_settings us
   WHERE us.user_id = v_user_id;

  -- Defensive: if no settings row exists, treat as not claimable rather
  -- than silently submitting with unknown guardrails.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;

  -- Load application + its job for threshold/dedup checks and channel routing.
  SELECT a.match_score, a.submitted_at, a.job_id, j.application_method, j.source_url
    INTO v_match_score, v_submitted_at, v_job_id, v_application_method, v_source_url
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = v_application_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
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

  -- Daily cap: count this user's submissions in the rolling 24h window.
  -- Transient, leave 'approved' so it can fire after the window rolls.
  SELECT count(*)
    INTO v_submitted_24h
    FROM public.application_queue q
   WHERE q.user_id = v_user_id
     AND q.status = 'submitted'
     AND q.submitted_at >= now() - interval '24 hours';

  IF v_submitted_24h >= v_daily_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap');
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

  -- BR-131 autonomy threshold re-validation (server-side). Only autonomous
  -- paths are gated; an explicit user-approved row (queued_by='user') bypasses
  -- this check because a human already approved it. Terminal on failure.
  IF v_queued_by IN ('assist_mode', 'auto_mode')
     AND (v_match_score IS NULL OR v_match_score < v_threshold) THEN
    UPDATE public.application_queue
       SET status     = 'cancelled',
           last_error = 'below_threshold',
           updated_at = now()
     WHERE id = p_queue_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'below_threshold');
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
  'ADR-006 / BR-131,132,135,136: service-role-only. Atomically re-validates autonomy guardrails (pause, credits, daily cap, no-resubmit, score threshold), charges one credit, and claims an approved application_queue row into submitting. Returns {ok,...}. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.claim_submission(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_submission(uuid) TO service_role;


-- ============================================================
-- 2) public.finalize_submission(
--      p_queue_id uuid, p_success boolean, p_channel text,
--      p_error text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
--    ) RETURNS void
--
--    Closes out a claimed ('submitting') row. Defensive: it ignores any
--    row not currently in 'submitting' so a duplicate/stale finalize call
--    cannot corrupt state or double-charge/refund.
--
--    Success (BR-135 / BR-002):
--      - queue -> submitted (records channel, clears last_error)
--      - applications.submitted_at = now()
--      - if stage = 'discovery', transition discovery -> applied and write
--        exactly one 'stage_transition' event (no duplicate)
--      - write a 'submission_attempt' event (outcome=success)
--
--    Failure (BR-136):
--      - REFUND the credit charged at claim (only successes consume credit)
--      - queue -> failed (records channel + last_error)
--      - write a 'submission_attempt' event (outcome=failure)
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_submission(
  p_queue_id  uuid,
  p_success   boolean,
  p_channel   text,
  p_error     text  DEFAULT NULL,
  p_metadata  jsonb DEFAULT '{}'::jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_queue          public.application_queue%ROWTYPE;
  v_user_id        uuid;
  v_application_id uuid;
  v_stage          text;
BEGIN
  -- Lock and only act on a row we actually claimed (defensive idempotency).
  SELECT *
    INTO v_queue
    FROM public.application_queue
   WHERE id = p_queue_id
   FOR UPDATE;

  IF NOT FOUND OR v_queue.status <> 'submitting' THEN
    RETURN;  -- nothing to finalize
  END IF;

  v_user_id        := v_queue.user_id;
  v_application_id := v_queue.application_id;

  IF p_success THEN
    -- Queue row -> submitted.
    UPDATE public.application_queue
       SET status       = 'submitted',
           submitted_at = now(),
           channel      = p_channel,
           last_error   = NULL,
           updated_at   = now()
     WHERE id = p_queue_id;

    -- Mark the application submitted (BR-135 confirmed submission).
    UPDATE public.applications
       SET submitted_at = now(),
           updated_at   = now()
     WHERE id = v_application_id
   RETURNING stage INTO v_stage;

    -- discovery -> applied only on confirmed submission (BR-135 / BR-002).
    -- We write exactly one stage_transition event inline. To prevent the
    -- applications stage-change safety-net trigger (fn_log_stage_transition)
    -- from inserting a *second* duplicate event, we set the session flag it
    -- checks BEFORE updating stage. (We intentionally do NOT call the
    -- SECURITY INVOKER transition_stage RPC here: it would not set that flag,
    -- which would yield a duplicate event.)
    IF v_stage = 'discovery' THEN
      PERFORM set_config('app.stage_event_written', 'true', true);

      UPDATE public.applications
         SET stage      = 'applied',
             updated_at = now()
       WHERE id = v_application_id;

      INSERT INTO public.application_events
        (user_id, application_id, event_type, from_stage, to_stage, actor, reason, metadata)
      VALUES
        (v_user_id, v_application_id, 'stage_transition', 'discovery', 'applied',
         'system', 'Confirmed submission', '{}'::jsonb);
    END IF;

    -- Audit the submission outcome (BR-002 / BR-133).
    INSERT INTO public.application_events
      (user_id, application_id, event_type, actor, reason, metadata)
    VALUES
      (v_user_id, v_application_id, 'submission_attempt', 'system',
       'Submitted via ' || coalesce(p_channel, 'unknown'),
       coalesce(p_metadata, '{}'::jsonb)
         || jsonb_build_object('outcome', 'success', 'channel', p_channel, 'source', 'submission-worker'));

  ELSE
    -- BR-136: refund the credit charged at claim — only successful
    -- submissions ultimately consume a credit.
    UPDATE public.user_settings
       SET credits    = credits + 1,
           updated_at = now()
     WHERE user_id = v_user_id;

    UPDATE public.application_queue
       SET status     = 'failed',
           last_error = p_error,
           channel    = p_channel,
           updated_at = now()
     WHERE id = p_queue_id;

    -- Audit the failure (BR-002 / BR-133). Failure is never silent (ADR-006).
    INSERT INTO public.application_events
      (user_id, application_id, event_type, actor, reason, metadata)
    VALUES
      (v_user_id, v_application_id, 'submission_attempt', 'system',
       'Submission failed: ' || coalesce(p_error, 'unknown'),
       coalesce(p_metadata, '{}'::jsonb)
         || jsonb_build_object('outcome', 'failure', 'channel', p_channel, 'error', p_error, 'source', 'submission-worker'));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalize_submission(uuid, boolean, text, text, jsonb) IS
  'ADR-006 / BR-135,136,002,133: service-role-only. Finalizes a submitting queue row: on success marks submitted, transitions discovery->applied with one stage_transition event, and logs a submission_attempt; on failure refunds the credit, marks failed, and logs the failure. Only acts on rows in submitting (idempotent). Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.finalize_submission(uuid, boolean, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.finalize_submission(uuid, boolean, text, text, jsonb) TO service_role;


-- ============================================================
-- 3) public.expire_stuck_submitting(p_older_than interval DEFAULT '30 minutes')
--      RETURNS integer
--
--    Self-heals after a crashed worker run: resets queue rows stuck in
--    'submitting' older than the cutoff back to 'approved' (so they can be
--    re-claimed) and refunds the credit charged at claim (mirrors the
--    failure refund — the submission never confirmed, so no credit is owed).
--    Returns the number of rows reset. Safe to run repeatedly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stuck_submitting(
  p_older_than interval DEFAULT interval '30 minutes'
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Refund credits for the rows we are about to reset (BR-136: an
  -- unconfirmed submission must not consume a credit). last_attempt_at
  -- is the time the claim flipped the row to 'submitting'.
  WITH stuck AS (
    SELECT id, user_id
      FROM public.application_queue
     WHERE status = 'submitting'
       AND last_attempt_at IS NOT NULL
       AND last_attempt_at < now() - p_older_than
     FOR UPDATE SKIP LOCKED
  ),
  refunded AS (
    UPDATE public.user_settings us
       SET credits    = credits + 1,
           updated_at = now()
      FROM stuck
     WHERE us.user_id = stuck.user_id
    RETURNING stuck.id AS queue_id
  ),
  reset AS (
    UPDATE public.application_queue q
       SET status     = 'approved',
           last_error = 'expired_stuck_submitting',
           updated_at = now()
      FROM refunded
     WHERE q.id = refunded.queue_id
    RETURNING q.id
  )
  SELECT count(*) INTO v_count FROM reset;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stuck_submitting(interval) IS
  'ADR-006 / BR-136: service-role-only self-heal. Resets queue rows stuck in submitting past the cutoff back to approved and refunds the unconsumed credit. Returns count reset. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.expire_stuck_submitting(interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stuck_submitting(interval) TO service_role;
