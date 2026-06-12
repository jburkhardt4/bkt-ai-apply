-- ============================================================
-- Migration: 20260612000003_create_gmail_sync_state
-- Entity:    E-018 — gmail_sync_state (email ingestion cursor)
-- Batch:     6 — Email pipeline
-- Security:  select own only; all writes via the gmail-sync
--            Edge Function (service role) — clients never mutate
--            sync cursors
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gmail_sync_state (
  user_id          uuid        PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  -- Gmail history cursor for incremental sync (users.history.list startHistoryId)
  history_id       text,
  last_synced_at   timestamptz,
  last_status      text
    CHECK (last_status IN ('success', 'partial', 'error', 'noop')),
  last_error       text,
  -- Reserved for the future push-webhook phase (users.watch expiry)
  watch_expiration timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Trigger: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_gmail_sync_state_updated_at
  BEFORE UPDATE ON public.gmail_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gmail sync state: select own"
  ON public.gmail_sync_state FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE policies — the gmail-sync Edge Function
-- (service role, bypasses RLS by design) owns all writes.
