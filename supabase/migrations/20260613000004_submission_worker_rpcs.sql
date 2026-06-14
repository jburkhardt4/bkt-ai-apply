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
-- Mostly additive. The ONE existing-object change (FIX 2 / BR-005) is a
-- DEFENSE-IN-DEPTH TIGHTENING: the application_queue INSERT policy is dropped
-- and recreated identically PLUS a new WITH CHECK clause requiring the inserted
-- application_id to belong to the caller — strictly narrowing, never widening.
-- No constraint is weakened. RLS stays ENABLED on every table.
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
--    (transient — a later approval / window roll can authorize it) or
--    cancels it (terminal). On success, decrements the credit and flips
--    the row to 'submitting', then returns the payload the worker needs
--    to drive the channel adapter (BR-134).
--
--    Authorization is SERVER-AUTHORITATIVE (BR-131/148): the right to
--    submit is NEVER taken from the client-supplied queued_by (audit-only).
--    A row may submit iff EITHER
--      (a) an explicit human approval exists — an application_events row
--          with event_type='approval' for (application_id,user_id),
--          written by approvePreparedPacket; this authorizes ANY mode; OR
--      (b) autonomous criteria hold — user_settings.review_mode IN
--          ('assist','auto') AND match_score >= auto_submit_score_threshold.
--    If neither holds the row is left 'approved' (transient) and awaits a
--    future approval — it is NEVER cancelled for lacking authorization.
--
--    Ownership (FIX 2 / BR-005): the application must belong to the queue
--    row's user_id; a mismatch returns 'not_owned' (no submit, no charge).
--
--    Concurrency (FIX 3 / BR-136): a per-user advisory xact lock serializes
--    concurrent claims for one user, and the daily-cap and monthly-budget counts
--    include in-flight 'submitting' rows so overlapping runs cannot exceed either cap.
--
--    Reason codes returned (ok:false):
--      not_claimable      row missing or not in 'approved' (no mutation)
--      not_owned          application not owned by queue row's user (no mutation) BR-005
--      paused             user_settings.paused = true       (stays approved) BR-132
--      no_credits         credits < 1                        (stays approved) BR-136
--      daily_cap                 >= daily_submission_cap submitted+in-flight in 24h (stays approved)
--      monthly_budget_exhausted  >= monthly_budget_usd submissions this calendar month (stays approved)
--      already_submitted         applications.submitted_at set      (-> cancelled)  BR-135
--      awaiting_approval         no approval event AND not autonomously eligible (stays approved) BR-130/131
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

  -- (b) Autonomous eligibility — server's review_mode is assist/auto AND the
  --     server-side match_score clears the server-side threshold.
  v_autonomous_ok := (
    v_review_mode IN ('assist', 'auto')
    AND v_match_score IS NOT NULL
    AND v_match_score >= v_threshold
  );

  -- Neither path authorizes submission yet: leave the row 'approved'
  -- (transient — a later approval event can authorize it). A below-threshold
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
  'ADR-006 / BR-005,130,131,132,135,136,148: service-role-only. Per-user advisory-locked. Re-validates autonomy guardrails server-side (ownership of application AND job, pause, credits, daily cap incl. in-flight, monthly budget incl. in-flight, no-resubmit) and authorizes submission ONLY via an explicit approval event OR server-side review_mode+score (never the client queued_by). Charges one credit and claims an approved application_queue row into submitting. Returns {ok,...}. Never callable by clients.';

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
--    Self-heals after a crashed worker run: rows stuck in 'submitting' past
--    the cutoff are moved to the TERMINAL 'failed' state (FIX 4) — NOT back
--    to 'approved'. Rationale: a row stuck in 'submitting' MAY have submitted
--    externally even though finalize never recorded it (applications.submitted_at
--    is still null). Returning it to 'approved' risks a SECOND external
--    submission on the next worker run. Terminal 'failed' requires manual
--    reconciliation and is never auto-resubmitted (the worker only claims
--    'approved' rows). The unconfirmed-but-charged credit is refunded
--    (BR-136), and each expired row gets a 'submission_attempt' application_event
--    flagged outcome='unconfirmed' so the unconfirmed state is visible/auditable.
--
--    Refunds are aggregated PER USER (FIX 4 edge case): if one user has
--    multiple stuck rows, that user's credits are incremented by the exact
--    COUNT of their stuck rows, not a flat +1.
--
--    Returns the number of rows expired. Safe to run repeatedly.
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
  -- Snapshot + lock the stuck rows once; every downstream CTE keys off this
  -- set. last_attempt_at is the time the claim flipped the row to 'submitting'.
  WITH stuck AS (
    SELECT id, user_id, application_id
      FROM public.application_queue
     WHERE status = 'submitting'
       AND last_attempt_at IS NOT NULL
       AND last_attempt_at < now() - p_older_than
     FOR UPDATE SKIP LOCKED
  ),
  -- BR-136: refund the unconsumed credit. Aggregate per user so a user with
  -- N stuck rows is refunded exactly N credits (not a flat +1 per UPDATE row).
  per_user AS (
    SELECT user_id, count(*)::integer AS n
      FROM stuck
     GROUP BY user_id
  ),
  refunded AS (
    UPDATE public.user_settings us
       SET credits    = credits + per_user.n,
           updated_at = now()
      FROM per_user
     WHERE us.user_id = per_user.user_id
    RETURNING us.user_id
  ),
  -- Move each stuck row to the TERMINAL 'failed' state (never back to approved).
  expired AS (
    UPDATE public.application_queue q
       SET status     = 'failed',
           last_error = 'expired_unconfirmed_submitting',
           updated_at = now()
      FROM stuck
     WHERE q.id = stuck.id
    RETURNING q.id, q.user_id, q.application_id
  ),
  -- Audit each expiry (BR-002 / BR-133): a submission_attempt event marking the
  -- outcome unconfirmed so manual reconciliation is possible. actor='system'
  -- and event_type='submission_attempt' are existing valid enum values.
  logged AS (
    INSERT INTO public.application_events
      (user_id, application_id, event_type, actor, reason, metadata)
    SELECT
      expired.user_id, expired.application_id, 'submission_attempt', 'system',
      'Stuck submission expired — manual reconciliation required',
      jsonb_build_object(
        'outcome', 'unconfirmed',
        'source',  'expire_stuck_submitting'
      )
    FROM expired
    RETURNING id
  )
  -- Data-modifying CTEs (refunded, expired, logged) always execute exactly
  -- once, whether or not the primary query references them; we count expired.
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stuck_submitting(interval) IS
  'ADR-006 / BR-136,002,133: service-role-only self-heal. Moves queue rows stuck in submitting past the cutoff to TERMINAL failed (never back to approved — avoids double external submission), refunds the unconsumed credit per user (correct count), and writes a submission_attempt event (outcome=unconfirmed) for each. Returns count expired. Never callable by clients.';

REVOKE EXECUTE ON FUNCTION public.expire_stuck_submitting(interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stuck_submitting(interval) TO service_role;


-- ============================================================
-- 4) RLS hardening (FIX 2 / BR-005) — root-cause defense-in-depth
--
--    The RPC ownership check (claim_submission, FIX 2) already closes the
--    submission hole: a queue row whose application_id is not owned by its
--    user_id is never submitted or charged. This RLS change tightens the
--    ROOT CAUSE so such a row can't be inserted in the first place.
--
--    Recreated faithfully from 20260612000004_create_application_queue.sql:
--    same name, role, columns, and the existing status constraint
--    ('pending_approval','approved') are preserved EXACTLY. The ONLY addition
--    is a WITH CHECK clause requiring the inserted application_id to belong to
--    the caller (auth.uid()). This strictly narrows the policy — it can never
--    admit a row the original policy would have rejected. RLS stays ENABLED.
-- ============================================================
DROP POLICY IF EXISTS "Application queue: insert own" ON public.application_queue;

CREATE POLICY "Application queue: insert own"
  ON public.application_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('pending_approval', 'approved')
    -- FIX 2 / BR-005: the queued application must belong to the caller.
    AND EXISTS (
      SELECT 1
        FROM public.applications a
       WHERE a.id = application_id
         AND a.user_id = (SELECT auth.uid())
    )
  );


-- ============================================================
-- 5) Tighten application_events INSERT policy + write_approval_event RPC
--    (FIX 6 / BR-130/131 — server-trusted approval signal)
--
--    The existing 'App events: insert own' policy (migration 20260603000010)
--    allows authenticated clients to INSERT any event_type for their own
--    applications, including event_type='approval'. A client in review mode
--    could therefore forge an approval event directly, enqueue an 'approved'
--    queue row, and have the submission worker submit without going through
--    the approvePreparedPacket / document-approval flow.
--
--    Fix: drop and recreate the INSERT policy adding event_type <> 'approval'
--    to the WITH CHECK clause. Approval events are SERVER-TRUSTED ONLY and
--    must be written via the write_approval_event SECURITY DEFINER RPC below,
--    which re-checks application ownership before inserting.
--
--    All other event types (note_added, score_override, etc.) remain
--    insertable by authenticated clients for their own applications.
-- ============================================================
DROP POLICY IF EXISTS "App events: insert own" ON public.application_events;

CREATE POLICY "App events: insert own"
  ON public.application_events FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    -- Approval events are server-trusted only; use write_approval_event() RPC.
    AND event_type <> 'approval'
  );


-- ============================================================
-- 6) public.write_approval_event(p_application_id uuid,
--                                p_metadata jsonb DEFAULT '{}')
--      RETURNS void
--
--    Server-trusted path for writing application_events rows with
--    event_type='approval'. Direct client inserts of approval events are
--    now blocked by the tightened 'App events: insert own' policy above;
--    this SECURITY DEFINER RPC is the only authorized write path.
--
--    Guarantees:
--      - Caller must be authenticated (auth.uid() is not null).
--      - Application must exist and belong to the caller.
--      - Writes exactly one 'approval' event with actor='jb_manual'.
--    Callable by authenticated users (not just service_role) so the
--    client-side approvePreparedPacket flow can still trigger approval.
-- ============================================================
CREATE OR REPLACE FUNCTION public.write_approval_event(
  p_application_id uuid,
  p_metadata       jsonb DEFAULT '{}'::jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'write_approval_event: caller is not authenticated';
  END IF;

  -- Ownership check: only write for applications belonging to the caller.
  IF NOT EXISTS (
    SELECT 1
      FROM public.applications a
     WHERE a.id      = p_application_id
       AND a.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'write_approval_event: application not found or not owned by caller';
  END IF;

  -- Submission artifact check (FIX 9 / BR-130/131): verify that a resume has
  -- been linked to the application via application_materials. This ensures the
  -- caller went through approvePreparedPacket (which calls linkDocumentsToApplication
  -- first) and cannot forge an approval event on a bare application that has
  -- never had a submission packet prepared.
  IF NOT EXISTS (
    SELECT 1
      FROM public.application_materials am
     WHERE am.application_id = p_application_id
       AND am.material_type  = 'resume'
  ) THEN
    RAISE EXCEPTION 'write_approval_event: no linked resume document found; complete the document preparation flow before approving (BR-130/131)';
  END IF;

  INSERT INTO public.application_events
    (user_id, application_id, event_type, actor, reason, metadata)
  VALUES
    (v_user_id, p_application_id, 'approval', 'jb_manual',
     'Submission packet approved by JB.',
     coalesce(p_metadata, '{}'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.write_approval_event(uuid, jsonb) IS
  'ADR-006 / BR-130/131: server-trusted path for approval events. Verifies (1) application ownership via auth.uid(), (2) that a resume has been linked via application_materials (i.e. approvePreparedPacket was called), then inserts an application_events row with event_type=approval. Direct client inserts of approval events are blocked by the tightened App events: insert own RLS policy. Callable by authenticated users.';

-- Public/anon cannot call this function.
REVOKE EXECUTE ON FUNCTION public.write_approval_event(uuid, jsonb) FROM PUBLIC, anon;
-- Authenticated users (approvePreparedPacket flow) may call it.
GRANT  EXECUTE ON FUNCTION public.write_approval_event(uuid, jsonb) TO authenticated;
