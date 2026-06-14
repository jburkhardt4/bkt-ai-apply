-- ============================================================
-- Migration: 20260614000002_notifications_add_auto_submitted
-- Phase 4 — widen notifications.notification_type for auto-submission outcomes
-- (decision #7, 2026-06-14): in-app notification on a successful auto-apply
-- (and on failure). Security unchanged; strictly widens the allowed set.
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN (
    'approval_needed',
    'stage_change',
    'ai_signal',
    'cost_alert',
    'email_sent',
    'auto_submitted',
    'submission_failed'
  ));
