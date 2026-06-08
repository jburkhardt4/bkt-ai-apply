/**
 * chatMemoryService — long-term, cross-conversation memory (chat_memory).
 *
 * Memory items are injected into the assistant system prompt and written back
 * when the model emits a MEMORY directive (see chatCompletionService). User-scoped
 * + RLS-enforced via the single Supabase client.
 */

import { getSupabaseClient } from '@/lib/supabase'
import type { ChatMemoryItem } from '../types'

const MEMORY_COLS = 'id, user_id, content, kind, source_conversation_id, created_at, updated_at'
/** How many memory items to surface as context per request. */
export const MEMORY_CONTEXT_LIMIT = 20

export async function listMemory(userId: string): Promise<ChatMemoryItem[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_memory')
    .select(MEMORY_COLS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(MEMORY_CONTEXT_LIMIT)

  if (error) throw new Error(`Failed to load memory: ${error.message}`)
  return (data ?? []) as ChatMemoryItem[]
}

export async function addMemory(params: {
  userId: string
  content: string
  kind?: string
  sourceConversationId?: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_memory').insert({
    user_id: params.userId,
    content: params.content,
    kind: params.kind ?? 'fact',
    source_conversation_id: params.sourceConversationId ?? null,
  })

  if (error) throw new Error(`Failed to save memory: ${error.message}`)
}

export async function deleteMemory(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('chat_memory').delete().eq('id', id)

  if (error) throw new Error(`Failed to delete memory: ${error.message}`)
}

/**
 * Persist new memory items, skipping ones that duplicate (case-insensitive) an
 * existing item. Returns the count actually added.
 */
export async function addMemoriesDeduped(
  userId: string,
  contents: string[],
  sourceConversationId: string | null,
): Promise<number> {
  if (contents.length === 0) return 0

  const existing = await listMemory(userId)
  const existingNorm = new Set(existing.map((m) => m.content.trim().toLowerCase()))

  const fresh = contents
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !existingNorm.has(c.toLowerCase()))

  let added = 0
  for (const content of fresh) {
    await addMemory({ userId, content, sourceConversationId })
    added += 1
  }
  return added
}
