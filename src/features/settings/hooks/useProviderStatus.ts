/**
 * useProviderStatus — loads which LLM providers have a configured key.
 *
 * Mirrors the codebase hook pattern (custom hook over the single Supabase
 * client; setState only inside promise callbacks per react-hooks/set-state-in-
 * effect). Exposes a manual refresh for the Integrations UI.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { fetchProviderStatus } from '../services/providerStatusService'
import type { ProviderStatusMap } from '../types'

export interface UseProviderStatus {
  status: ProviderStatusMap | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useProviderStatus(): UseProviderStatus {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [status, setStatus] = useState<ProviderStatusMap | null>(null)
  const [loading, setLoading] = useState<boolean>(userId != null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchProviderStatus()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load provider status')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchProviderStatus()
      setStatus(next)
      setError(null)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load provider status'
      setError(message)
      throw e instanceof Error ? e : new Error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { status, loading, error, refresh }
}
