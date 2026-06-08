/**
 * ai-agent domain types.
 *
 * NOTE: chat_conversations / chat_messages / chat_memory are created by
 * supabase/migrations/20260608000001_create_chat.sql. Until `pnpm db:gen-types`
 * runs against the applied migration these tables are absent from
 * src/types/db.types.ts, so the row/insert shapes are hand-written here and
 * query results are cast to them (this mirrors the existing cast pattern in
 * chatAssistantService.ts). After db:gen-types, re-derive these from
 * Database['public']['Tables'][...]['Row'] to keep a single source of truth.
 */

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatConversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  user_id: string
  role: ChatRole
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatMemoryItem {
  id: string
  user_id: string
  content: string
  kind: string
  source_conversation_id: string | null
  created_at: string
  updated_at: string
}
