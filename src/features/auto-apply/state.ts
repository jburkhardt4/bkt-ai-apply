// BKT AI-Apply — client-side shared state for the redesigned surface.
//
// Phase 2 data backbone: credits / budget / review-mode / paused / last
// auto-apply target are now backed by the `user_settings` row (via
// <AutoApplySettingsProvider> + ../settings-context), so they persist
// server-side and survive across devices. The remaining seed-tracking
// hooks (submitted delta, applied/saved search ids) stay in localStorage
// until Phase 2b swaps Search/Saved onto real `jobs`/`saved_jobs` rows.
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { usePersistentState } from './hooks/useAutoApplyData'
import { useAutoApplySettings } from './settings-context'
import type { AutoApplySettings } from './services/settingsService'

/* ---------------- user_settings-backed (server persisted) ---------------- */

function useSettingField<K extends keyof AutoApplySettings>(
  key: K,
): [AutoApplySettings[K], Dispatch<SetStateAction<AutoApplySettings[K]>>] {
  const { settings, setField } = useAutoApplySettings()
  const set = useCallback<Dispatch<SetStateAction<AutoApplySettings[K]>>>((value) => setField(key, value), [setField, key])
  return [settings[key], set]
}

export function useCredits() {
  return useSettingField('credits')
}

export function useBudget() {
  return useSettingField('budget')
}

export function useReviewMode() {
  return useSettingField('reviewMode')
}

export function usePaused() {
  return useSettingField('paused')
}

/** The most recent posting Auto Apply targeted — drives doc auto-align. */
export function useLastTarget() {
  return useSettingField('lastTarget')
}

/* ---------------- localStorage (Phase 2b will move these to the DB) ------- */

/** Extra submissions made this session/device on top of the seeded stat. */
export function useSubmittedDelta() {
  return usePersistentState<number>('submitted-delta', 0)
}

/** Job-board postings auto-applied from Search/Saved (ids). */
export function useAppliedSearchIds() {
  return usePersistentState<string[]>('applied-search-ids', [])
}

/** Job-board postings bookmarked from Search (ids). */
export function useSavedSearchIds() {
  return usePersistentState<string[]>('saved-search-ids', [])
}

/** Seeded saved jobs the user deleted (ids). */
export function useRemovedSeedSavedIds() {
  return usePersistentState<string[]>('removed-seed-saved-ids', [])
}
