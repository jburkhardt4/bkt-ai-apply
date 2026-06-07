/**
 * useProspectorProfile
 *
 * Fetches and manages the current user's prospecting_profiles row.
 *
 * Rules enforced:
 *   BR-004 — all DB access via getSupabaseClient() from src/lib/supabase.ts
 *   BR-005 — every query filters by user_id = auth.uid() (enforced both by RLS and explicit filter)
 *   BR-008 — auth state via useAuth() only
 *   BR-081 / BR-082 — types from generated db.types.ts only; no handwritten DB types
 *   BR-101 — one profile per user; upsert uses onConflict: 'user_id'
 *   BR-107 — toggle flips is_active and persists immediately
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import type { Tables, TablesInsert } from '@/types/db.types'

// Columns the form, toggle, and dashboard actually consume. Derived from the
// generated Tables<'prospecting_profiles'> type — never handwritten
// (BR-081 / BR-082) — and kept in sync with the explicit .select() calls below
// so we stop over-fetching created_at / updated_at / last_run_at, none of which
// any consumer reads (the dashboard derives last-run from useProspectingRuns).
const PROFILE_COLUMNS =
  'id, user_id, job_titles, locations, job_types, environments, min_salary, keywords, is_active, next_run_at' as const

export type ProspectingProfileRow = Pick<
  Tables<'prospecting_profiles'>,
  | 'id'
  | 'user_id'
  | 'job_titles'
  | 'locations'
  | 'job_types'
  | 'environments'
  | 'min_salary'
  | 'keywords'
  | 'is_active'
  | 'next_run_at'
>
export type ProspectingProfileInsert = TablesInsert<'prospecting_profiles'>

export interface UseProspectorProfileResult {
  profile: ProspectingProfileRow | null
  loading: boolean
  error: string | null
  upsertProfile: (values: Omit<ProspectingProfileInsert, 'user_id'>) => Promise<void>
  toggleActive: (active: boolean) => Promise<void>
  isSaving: boolean
  isToggling: boolean
}

export function useProspectorProfile(): UseProspectorProfileResult {
  const { user } = useAuth()

  // Initialize loading based on whether a user is present.
  // When user is null, there is nothing to fetch so loading starts false.
  const [profile, setProfile] = useState<ProspectingProfileRow | null>(null)
  const [loading, setLoading] = useState(user != null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  useEffect(() => {
    // No user — nothing to fetch; state already initialized to empty/false.
    if (!user) return

    let cancelled = false
    const supabase = getSupabaseClient()

    Promise.resolve(
      supabase
        .from('prospecting_profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle(),
    )
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setProfile(null)
        } else {
          setProfile(data)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load profile')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const upsertProfile = useCallback(
    async (values: Omit<ProspectingProfileInsert, 'user_id'>) => {
      if (!user) return

      setIsSaving(true)
      setError(null)

      const supabase = getSupabaseClient()
      const payload: ProspectingProfileInsert = {
        ...values,
        user_id: user.id,
      }

      const { data, error: upsertError } = await supabase
        .from('prospecting_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select(PROFILE_COLUMNS)
        .single()

      if (upsertError) {
        setError(upsertError.message)
      } else {
        setProfile(data)
      }

      setIsSaving(false)
    },
    [user],
  )

  const toggleActive = useCallback(
    async (active: boolean) => {
      if (!user) return

      // Optimistic update
      setProfile((prev) => (prev ? { ...prev, is_active: active } : prev))
      setIsToggling(true)
      setError(null)

      const supabase = getSupabaseClient()
      const { data, error: toggleError } = await supabase
        .from('prospecting_profiles')
        .upsert(
          { user_id: user.id, is_active: active },
          { onConflict: 'user_id' },
        )
        .select(PROFILE_COLUMNS)
        .single()

      if (toggleError) {
        // Revert optimistic update on error
        setProfile((prev) => (prev ? { ...prev, is_active: !active } : prev))
        setError(toggleError.message)
      } else {
        setProfile(data)
      }

      setIsToggling(false)
    },
    [user],
  )

  return {
    profile,
    loading,
    error,
    upsertProfile,
    toggleActive,
    isSaving,
    isToggling,
  }
}
