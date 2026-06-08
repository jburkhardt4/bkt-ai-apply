/**
 * useChatConversations — client state for the conversational assistant.
 *
 * Loads the user's conversation list and the active conversation's messages,
 * and exposes send / new / select / rename / delete. v1 reloads canonical
 * messages after each send (Supabase Realtime is a deferred enhancement).
 *
 * Effects only call setState inside promise callbacks (never synchronously in
 * the effect body) per react-hooks/set-state-in-effect; loading/clear on
 * conversation switch is raised by the action callbacks that change activeId.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  deleteConversation as deleteConversationSvc,
  getMessages,
  listConversations,
  renameConversation as renameConversationSvc,
} from '../services/chatConversationsService'
import { sendChatMessage } from '../services/chatCompletionService'
import type { ChatConversation, ChatMessage } from '../types'

export interface UseChatConversations {
  conversations: ChatConversation[]
  activeId: string | null
  messages: ChatMessage[]
  loadingMessages: boolean
  sending: boolean
  error: string | null
  send: (message: string) => Promise<void>
  startNewConversation: () => void
  selectConversation: (id: string) => void
  rename: (id: string, title: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useChatConversations(applicationId?: string | null): UseChatConversations {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the conversation list once the user is known.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listConversations(userId)
      .then((list) => {
        if (cancelled) return
        setConversations(list)
        setActiveId((prev) => prev ?? list[0]?.id ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chats')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // Load messages when the active conversation changes.
  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    getMessages(activeId)
      .then((m) => {
        if (!cancelled) setMessages(m)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load messages')
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeId])

  const send = useCallback(
    async (text: string) => {
      if (!userId) return
      const message = text.trim()
      if (!message) return

      setSending(true)
      setError(null)

      // Optimistic user bubble for immediate feedback.
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: activeId ?? 'pending',
        user_id: userId,
        role: 'user',
        content: message,
        metadata: {},
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const result = await sendChatMessage({
          userId,
          message,
          conversationId: activeId,
          applicationId: applicationId ?? undefined,
        })
        const [freshMessages, freshList] = await Promise.all([
          getMessages(result.conversationId),
          listConversations(userId),
        ])
        setActiveId(result.conversationId)
        setMessages(freshMessages)
        setConversations(freshList)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to send message')
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      } finally {
        setSending(false)
      }
    },
    [userId, activeId, applicationId],
  )

  const startNewConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [])

  const selectConversation = useCallback((id: string) => {
    setActiveId(id)
    setMessages([])
    setLoadingMessages(true)
    setError(null)
  }, [])

  const rename = useCallback(async (id: string, title: string) => {
    await renameConversationSvc(id, title)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteConversationSvc(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setActiveId((prev) => (prev === id ? null : prev))
  }, [])

  return {
    conversations,
    activeId,
    messages,
    loadingMessages,
    sending,
    error,
    send,
    startNewConversation,
    selectConversation,
    rename,
    remove,
  }
}
