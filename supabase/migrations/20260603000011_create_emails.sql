-- ============================================================
-- Migration: 20260603000011_create_emails
-- Entity:    E-011 — emails
-- Batch:     4 — Events, Emails, Interviews
-- Security:  user_id scoped; SELECT/INSERT only (no client UPDATE/DELETE);
--            UNIQUE(gmail_message_id) deduplicates push events;
--            confidence CHECK 0.0–1.0 (CHK-004)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.emails (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- Nullable: email may not be matched to an application yet
  application_id      uuid        REFERENCES public.applications (id) ON DELETE SET NULL,
  gmail_message_id    text        NOT NULL,
  from_address        text        NOT NULL,
  subject             text,
  body_snippet        text,
  classification      text        NOT NULL
    CHECK (classification IN (
      'interview_invite',
      'rejection',
      'offer',
      'outreach',
      'follow_up',
      'unknown'
    )),
  -- CHK-004: confidence range 0.0–1.0
  confidence          numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0.000 AND 1.000),
  -- BR-030/BR-031: auto-actioned only when confidence >= 0.70
  auto_actioned       boolean      NOT NULL DEFAULT false,
  received_at         timestamptz  NOT NULL,
  processed_at        timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────
-- Deduplicate Gmail push notifications (BR-063 pattern applied to emails)
CREATE UNIQUE INDEX IF NOT EXISTS emails_gmail_message_id_user_idx
  ON public.emails (user_id, gmail_message_id);

CREATE INDEX IF NOT EXISTS emails_user_id_idx         ON public.emails (user_id);
CREATE INDEX IF NOT EXISTS emails_application_id_idx  ON public.emails (application_id);
CREATE INDEX IF NOT EXISTS emails_received_at_idx     ON public.emails (received_at DESC);
CREATE INDEX IF NOT EXISTS emails_classification_idx  ON public.emails (classification);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Emails: select own"
  ON public.emails FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Emails: insert own"
  ON public.emails FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE is intentionally omitted from client RLS.
-- The gmail_scraper Edge Function (service role) updates
-- application_id and processed_at after classification.
-- Client has no need to mutate email records directly.

-- No DELETE policy — email history is audit trail.
-- PRIV-001 purge handled by service-role function.
