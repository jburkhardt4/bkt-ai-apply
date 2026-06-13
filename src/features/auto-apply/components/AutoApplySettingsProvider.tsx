// BKT AI-Apply — Auto-Apply settings provider (Phase 2 data backbone).
// Loads the user's `user_settings` row once and exposes a `[value, setValue]`
// style store consumed by the dashboard/route hooks in ../state.ts. Writes
// are optimistic + best-effort persisted (single changed column per call).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { AutoApplySettingsContext, resolveSetStateAction, type AutoApplySettingsStore } from '../settings-context'
import { DEFAULT_SETTINGS, fetchSettings, persistSettings, type AutoApplySettings } from '../services/settingsService'

export function AutoApplySettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [settings, setSettings] = useState<AutoApplySettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  // Mirror current settings into a ref (synced in an effect, never during
  // render) so setField can read the latest value without a side effect
  // inside the state updater (StrictMode-safe).
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    if (!userId) return
    alive.current = true
    fetchSettings(userId).then(
      (loaded) => {
        if (alive.current) {
          setSettings(loaded)
          setLoading(false)
        }
      },
      () => {
        if (alive.current) setLoading(false)
      },
    )
    return () => {
      alive.current = false
    }
  }, [userId])

  const setField = useCallback<AutoApplySettingsStore['setField']>(
    (key, value) => {
      const prev = settingsRef.current
      const next = resolveSetStateAction(value, prev[key])
      if (Object.is(next, prev[key])) return
      const updated = { ...prev, [key]: next }
      settingsRef.current = updated
      setSettings(updated)
      if (userId) {
        persistSettings(userId, { [key]: next } as Partial<AutoApplySettings>).catch((err) => {
          console.error('[auto-apply settings] persist failed', err)
        })
      }
    },
    [userId],
  )

  return <AutoApplySettingsContext.Provider value={{ settings, loading, setField }}>{children}</AutoApplySettingsContext.Provider>
}
