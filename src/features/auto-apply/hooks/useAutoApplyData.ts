// BKT AI-Apply — small persistence + data-loading hooks for the
// redesigned Auto-Apply surface.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

const NS = 'bkt-auto-apply:'

/** useState that mirrors into localStorage (JSON), namespaced under
 *  "bkt-auto-apply:". Used for client-side preferences that have no
 *  backing table yet (credits, budget, saved jobs, review mode…). */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(NS + key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(NS + key, JSON.stringify(value))
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, [key, value])
  return [value, setValue]
}

/** Generic async loader with mounted-guard; reload() re-runs the fetch. */
export function useAsyncData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    load().then(
      (d) => {
        if (alive.current) {
          setData(d)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  // Loading starts true (useState initial) and is re-raised in the reload
  // action callback — never synchronously inside the effect body.
  const reload = useCallback(() => {
    setLoading(true)
    setTick((t) => t + 1)
  }, [])
  return { data, loading, reload }
}
