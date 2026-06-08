/**
 * chatConversationsService — CRUD for chat_conversations + chat_messages.
 *
 * All access via the single Supabase client (BR-004); every query is user-scoped
 * and RLS-enforced (BR-005). Results are cast to the hand-written row types in
 * ../types (see note there re: db:gen-types).
 */

import { getSupabaseClient } from '@/lib/supabase'
import type { ChatConversation, ChatMessage, ChatRole } from '../types'

const CONVERSATION_COLS = 'id, user_id, title, created_at, updated_at'
const MESSAGE_COLS = 'id, conversation_id, user_id, role, content, metadata, created_at'

export async function listConversations(userId: string): Promise<ChatConversation[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_COLS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to load conversations: ${error.message}`)
  return (data ?? []) as ChatConversation[]
}

export async function createConversation(
  userId: string,
  title = 'New chat',
): Promise<ChatConversation> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, title })
    .select(CONVERSATION_COLS)
    .single()

  if (error) throw new Error(`Failed to create conversation: ${error.message}`)
  return data as ChatConversation
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('chat_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to rename conversation: ${error.message}`)
}

export async function touchConversation(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to update conversation: ${error.message}`)
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_conversations').delete().eq('id', id)

  if (error) throw new Error(`Failed to delete conversation: ${error.message}`)
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)
  return (data ?? []) as ChatMessage[]
}

export interface AppendMessageInput {
  conversationId: string
  userId: string
  role: ChatRole
  content: string
  metadata?: Record<string, unknown>
}

export async function appendMessage(input: AppendMessageInput): Promise<ChatMessage> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .select(MESSAGE_COLS)
    .single()

  if (error) throw new Error(`Failed to save message: ${error.message}`)
  return data as ChatMessage
}
