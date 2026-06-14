import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from './auth-context'
import { getSupabaseClientSafe } from '../lib/supabase'

interface AuthProviderProps {
  children: ReactNode
}

// Resolve once at module level — env vars are static for the lifetime of the
// page, so this never changes. Using it as the useState initializer avoids a
// synchronous setState inside the effect (lint: set-state-in-effect).
const supabaseAvailable = getSupabaseClientSafe() !== null

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  // When Supabase is not configured there is nothing to load — start ready.
  const [loading, setLoading] = useState(supabaseAvailable)

  useEffect(() => {
    const supabase = getSupabaseClientSafe()

    if (!supabase) {
      return
    }

    let isMounted = true

    const initializeAuth = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        if (isMounted) {
          setSession(null)
          setUser(null)
          setLoading(false)
        }
        return
      }

      if (isMounted) {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      }
    }

    void initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClientSafe()
    if (!supabase) return
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      signOut,
    }),
    [user, session, loading, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}