/**
 * useSelectedModel — remembers the user's chosen chat model.
 *
 * Persists the selection in localStorage (per user) and validates it against the
 * catalog in src/lib/ai-router.ts so a stale/unknown name can never be sent.
 * setState happens only inside a promise callback per react-hooks/set-state-in-
 * effect (matching the codebase convention).
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { DEFAULT_CHAT_MODEL_NAME, getChatModelOption } from '@/lib/ai-router'

const STORAGE_PREFIX = 'bkt:chat-model:'

export interface UseSelectedModel {
  selectedModel: string
  setSelectedModel: (modelName: string) => void
}

export function useSelectedModel(): UseSelectedModel {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [selectedModel, setSelected] = useState<string>(DEFAULT_CHAT_MODEL_NAME)

  // Restore the persisted choice once the user is known.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    let cancelled = false
    Promise.resolve(window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`)).then((stored) => {
      if (cancelled) return
      if (stored && getChatModelOption(stored)) setSelected(stored)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const setSelectedModel = useCallback(
    (modelName: string) => {
      if (!getChatModelOption(modelName)) return
      setSelected(modelName)
      if (userId && typeof window !== 'undefined') {
        window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, modelName)
      }
    },
    [userId],
  )

  return { selectedModel, setSelectedModel }
}
