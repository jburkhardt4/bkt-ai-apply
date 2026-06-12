// BKT AI-Apply — client-side shared state for the redesigned surface.
// Credits / budget / review-mode / saved-jobs have no backing tables yet,
// so they persist in localStorage (see README-REDESIGN.md for the follow-up
// migration plan). Everything is namespaced under "bkt-auto-apply:".
import { usePersistentState } from './hooks/useAutoApplyData'
import { JOBS_SEED } from './data/jobsData'
import { SEARCH_SEED } from './data/searchData'
import type { ReviewModeId, SearchJob } from './types'

export function useCredits() {
  return usePersistentState<number>('credits', JOBS_SEED.user.credits)
}

export function useBudget() {
  return usePersistentState<number>('budget', 240)
}

export function useReviewMode() {
  return usePersistentState<ReviewModeId>('review-mode', 'review')
}

export function usePaused() {
  return usePersistentState<boolean>('paused', false)
}

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

const DEFAULT_TARGET: SearchJob = SEARCH_SEED.jobs.find((j) => j.id === 's7') ?? SEARCH_SEED.jobs[0]!

/** The most recent posting Auto Apply targeted — drives doc auto-align. */
export function useLastTarget() {
  return usePersistentState<SearchJob>('last-target', DEFAULT_TARGET)
}
