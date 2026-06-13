-- ============================================================
-- Migration: 20260613000001_create_gmail_label_map
-- Entity:    E-020 — gmail_label_map (BR-037) + emails threading
-- Batch:     6 — Email pipeline
-- Security:  user_id scoped; full CRUD own (user-editable config);
--            classification CHECK mirrors the emails enum
-- ============================================================

-- ── emails: reply threading + raw Gmail labels at ingest ─────
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS thread_id    text,
  ADD COLUMN IF NOT EXISTS gmail_labels text[] NOT NULL DEFAULT '{}';

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gmail_label_map (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  -- Matched case-insensitively against Gmail label names at sync time
  gmail_label    text        NOT NULL,
  classification text        NOT NULL
    CHECK (classification IN (
      'interview_invite',
      'rejection',
      'offer',
      'outreach',
      'follow_up',
      'unknown'
    )),
  -- Inbox chip id (InboxScreen label taxonomy)
  display_label  text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_label)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS gmail_label_map_user_id_idx ON public.gmail_label_map (user_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.gmail_label_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gmail label map: select own"
  ON public.gmail_label_map FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Gmail label map: insert own"
  ON public.gmail_label_map FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Gmail label map: update own"
  ON public.gmail_label_map FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Gmail label map: delete own"
  ON public.gmail_label_map FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── Seed: JB's Gmail taxonomy (mirrors the inbox chip set) ────
INSERT INTO public.gmail_label_map (user_id, gmail_label, classification, display_label)
SELECT u.id, m.gmail_label, m.classification, m.display_label
FROM public.users u
CROSS JOIN (VALUES
  ('Application Confirmation', 'follow_up',        'app-confirm'),
  ('Interview Invite',         'interview_invite', 'interview-inv'),
  ('Interview Follow-up',      'follow_up',        'interview-fu'),
  ('Interview Feedback',       'follow_up',        'interview-fb'),
  ('Assessment',               'follow_up',        'assess-inv'),
  ('Rejected',                 'rejection',        'rejected'),
  ('Offer',                    'offer',            'hired'),
  ('OTP',                      'unknown',          'otp'),
  ('EEO',                      'unknown',          'eeo')
) AS m(gmail_label, classification, display_label)
ON CONFLICT (user_id, gmail_label) DO NOTHING;
