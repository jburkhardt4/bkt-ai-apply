-- ============================================================
-- Migration: 20260613000002_notifications_add_email_sent
-- Entity:    E-013 — notifications (BR-038)
-- Batch:     6 — Email pipeline
-- Security:  unchanged; widens notification_type for gmail-send
--            audit rows (also the send rate-guard source)
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
    'email_sent'
  ));
