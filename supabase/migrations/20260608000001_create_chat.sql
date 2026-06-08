-- ============================================================
-- Migration: 20260608000001_create_chat
-- Entity:    chat_conversations, chat_messages, chat_memory
-- Purpose:   Persistent conversational AI assistant — tracked
--            conversations, per-conversation message history, and
--            long-term cross-conversation memory.
-- Security:  RLS on; user_id scoped (BR-001, BR-005). The browser
--            never holds the model key; replies are produced by the
--            ai-chat Edge Function (ANTHROPIC_API_KEY).
-- ============================================================

-- ── chat_conversations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT 'New chat',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_user_updated_idx
  ON public.chat_conversations (user_id, updated_at DESC);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat conversations: select own"
  ON public.chat_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Chat conversations: insert own"
  ON public.chat_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat conversations: update own"
  ON public.chat_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat conversations: delete own"
  ON public.chat_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── chat_messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES public.chat_conversations (id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role             text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          text        NOT NULL,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON public.chat_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx
  ON public.chat_messages (user_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat messages: select own"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Chat messages: insert own"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat messages: delete own"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── chat_memory (long-term, cross-conversation) ──────────────
CREATE TABLE IF NOT EXISTS public.chat_memory (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content                text        NOT NULL,
  kind                   text        NOT NULL DEFAULT 'fact',
  source_conversation_id uuid        REFERENCES public.chat_conversations (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_memory_user_updated_idx
  ON public.chat_memory (user_id, updated_at DESC);

ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat memory: select own"
  ON public.chat_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Chat memory: insert own"
  ON public.chat_memory FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat memory: update own"
  ON public.chat_memory FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat memory: delete own"
  ON public.chat_memory FOR DELETE TO authenticated
  USING (user_id = auth.uid());
