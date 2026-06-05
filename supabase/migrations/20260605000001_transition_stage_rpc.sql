-- RPC: transition_stage
-- Atomically updates applications.stage and inserts an application_events row.
-- Called from the client instead of two sequential round-trips.
-- Enforces BR-002: every applications.stage change must write an application_events row.
CREATE OR REPLACE FUNCTION public.transition_stage(
  p_application_id  uuid,
  p_user_id         uuid,
  p_from_stage      text,
  p_to_stage        text,
  p_reason          text,
  p_actor           text DEFAULT 'jb_manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER  -- runs as calling user; RLS policies apply
AS $$
BEGIN
  -- Verify ownership and current stage atomically (optimistic lock)
  UPDATE public.applications
  SET    stage      = p_to_stage,
         updated_at = now()
  WHERE  id         = p_application_id
    AND  user_id    = p_user_id
    AND  stage      = p_from_stage;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage transition failed: application not found, not owned by user, or stage has changed (expected %).',
      p_from_stage;
  END IF;

  -- Insert audit event in the same transaction (BR-002)
  INSERT INTO public.application_events
    (application_id, user_id, event_type, from_stage, to_stage, actor, reason, metadata)
  VALUES
    (p_application_id, p_user_id, 'stage_transition', p_from_stage, p_to_stage, p_actor, p_reason, '{}'::jsonb);
END;
$$;

-- Grant execute to authenticated users (RLS inside the function enforces user_id)
GRANT EXECUTE ON FUNCTION public.transition_stage TO authenticated;
