-- ============================================================
-- Migration: 20260613000003_consolidate_gmail_label_map
-- Entity:    E-020 — gmail_label_map (taxonomy consolidation)
-- Batch:     6 — Email pipeline
-- Security:  unchanged (RLS as created)
-- ============================================================
-- JB consolidated the inbox label taxonomy 10 → 7 and is renaming his
-- Gmail labels to match exactly (1:1 map): App Confirmed, Action Required
-- (absorbs OTP + EEO), Assessment, Interviewing (absorbs Interview
-- Invite/Follow-up/Feedback), Offer, Hired, Rejected.
--
-- The emails.classification engine enum and the applications.stage pipeline
-- are deliberately untouched: 'Hired' maps to classification 'offer' (the
-- enum has no 'hired'; offer → hired remains a manual stage confirmation),
-- and 'Action Required' maps to 'unknown' (stored via the BR-035 label
-- force-store, no auto-transition).

DELETE FROM public.gmail_label_map
WHERE gmail_label IN (
  'Application Confirmation',
  'Interview Invite',
  'Interview Follow-up',
  'Interview Feedback',
  'Assessment',
  'Rejected',
  'Offer',
  'OTP',
  'EEO'
);

INSERT INTO public.gmail_label_map (user_id, gmail_label, classification, display_label)
SELECT u.id, m.gmail_label, m.classification, m.display_label
FROM public.users u
CROSS JOIN (VALUES
  ('App Confirmed',   'follow_up',        'app-confirm'),
  ('Action Required', 'unknown',          'action-required'),
  ('Assessment',      'follow_up',        'assessment'),
  ('Interviewing',    'interview_invite', 'interviewing'),
  ('Offer',           'offer',            'offer'),
  ('Hired',           'offer',            'hired'),
  ('Rejected',        'rejection',        'rejected')
) AS m(gmail_label, classification, display_label)
ON CONFLICT (user_id, gmail_label) DO UPDATE
  SET classification = EXCLUDED.classification,
      display_label  = EXCLUDED.display_label;
