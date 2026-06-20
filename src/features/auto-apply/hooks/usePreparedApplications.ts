// BKT AI-Apply — usePreparedApplications hook (ADR-013).
//
// Loads the signed-in user's prepared_applications list over the single Supabase
// client and exposes an on-demand prepare(input) action. Auth comes from the
// AuthProvider only (BR-008); every read is user_id-scoped in the service layer
// (BR-005). This is a .ts hook file (no component export), so react-refresh is
// satisfied without a sibling split.
//
// react-hooks/set-state-in-effect: every setState in the effect runs INSIDE the
// promise callbacks (never synchronously in the effect body); loading is started
// true in useState and re-raised in the reload / prepare action callbacks — the
// approved "async loaders" pattern from docs/conventions/component-patterns.md.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import {
  fetchPreparedApplications,
  triggerPrepare,
  type PreparedApplicationRow,
  type TriggerPrepareInput,
  type TriggerPrepareResult,
} from '@/features/applications/services/preparedApplicationService'

export interface UsePreparedApplicationsResult {
  /** The user's prepared applications, newest first; empty until loaded. */
  items: PreparedApplicationRow[]
  /** True while the list is (re)loading. */
  loading: boolean
  /** True while an on-demand prepare(input) call is in flight. */
  preparing: boolean
  /** The most recent error message (load or prepare), or null. */
  error: string | null
  /** Re-fetches the list. */
  reload: () => void
  /** Kicks off an on-demand prep for one job, then refreshes the list. Resolves
   *  with the Edge Function result, or rejects with a catchable error. */
  prepare: (input: TriggerPrepareInput) => Promise<TriggerPrepareResult>
}

export function usePreparedApplications(): UsePreparedApplicationsResult {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // loading seeds true when a session is present at mount so the initial fetch
  // shows a loading state; with no session it seeds false (nothing to load).
  const [items, setItems] = useState<PreparedApplicationRow[]>([])
  const [loading, setLoading] = useState<boolean>(() => userId != null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)
  // Store-previous-user in STATE (not a ref — refs may not be read/written
  // during render per react-hooks/refs) and reset during render on a session
  // change. React supports this "adjust state during render" form; the
  // setPrevUserId guard makes it run at most once per change (no loop). Mirrors
  // component-patterns.md → "Resetting state without effects".
  const [prevUserId, setPrevUserId] = useState<string | null>(userId)
  if (prevUserId !== userId) {
    setPrevUserId(userId)
    if (userId) {
      // Signed in (or switched user): the effect below will fetch — show loading.
      if (!loading) setLoading(true)
    } else {
      // Signed out: clear the list and stop loading without an effect setState.
      if (items.length > 0) setItems([])
      if (loading) setLoading(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    alive.current = true
    fetchPreparedApplications(userId).then(
      (rows) => {
        if (alive.current) {
          setItems(rows)
          setError(null)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (alive.current) {
          setError(err instanceof Error ? err.message : 'Could not load prepared applications.')
          setLoading(false)
        }
      },
    )
    return () => {
      alive.current = false
    }
  }, [userId, tick])

  // Loading is re-raised here (action callback), never synchronously in the
  // effect body — satisfies react-hooks/set-state-in-effect.
  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    setTick((t) => t + 1)
  }, [])

  const prepare = useCallback(
    async (input: TriggerPrepareInput): Promise<TriggerPrepareResult> => {
      setPreparing(true)
      setError(null)
      try {
        const result = await triggerPrepare(input)
        // Refresh the list so the new prep shows immediately.
        setLoading(true)
        setTick((t) => t + 1)
        return result
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not prepare this application.'
        setError(message)
        throw err
      } finally {
        setPreparing(false)
      }
    },
    [],
  )

  return { items, loading, preparing, error, reload, prepare }
}
