/**
 * useProspectorTableControls
 *
 * Client-side sort, filter, and row-removal state for the ProspectorSearchResults
 * data table. All state is in-memory only — no DB mutations, no persistence across
 * page reload. This is intentional for this cycle (scoped by work order
 * WO-20260608-prospector-table-overhaul).
 *
 * Sort tiebreak: stable secondary sort by `title` ascending. JavaScript's
 * Array.prototype.sort is stable in all modern engines (V8 >= Node 11).
 *
 * Null placement:
 *   asc  → nulls last  (known values surface first — most useful default)
 *   desc → nulls first (mirrors the "flip everything" intent of descending order)
 *
 * Dependencies: none beyond React and the shared ProspectorSearchResult type.
 */

import { useCallback, useMemo, useReducer } from 'react'
import type { ProspectorSearchResult } from './useProspectorSearchResults'
import { deriveSourceLabel } from '../components/prospectorJobFields'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SortKey =
  | 'title'
  | 'company_name'
  | 'job_type'
  | 'remote_type'
  | 'compensation_min'
  | 'posted_at'
  | 'match_score'
  | 'created_at'
  | 'source_url'

export type SortDir = 'asc' | 'desc'

export interface SortState {
  key: SortKey | null
  dir: SortDir
}

export interface FilterState {
  title: string
  company: string
  jobType: string      // '' = all; exact match against job_type values
  environment: string  // '' = all; exact match against remote_type values
  salaryMin: string    // '' = unset; parsed to number on compare
  salaryMax: string    // '' = unset; parsed to number on compare
  scoreMin: string     // '' = unset; minimum match score on compare
  source: string       // '' = all; substring match against derived source label
}

export interface UndoTarget {
  id: string
  title: string
}

// ── Internal state ────────────────────────────────────────────────────────────

interface ControlsState {
  sort: SortState
  filters: FilterState
  /** IDs of jobs dismissed (hidden) by the user this session. */
  hiddenIds: Set<string>
  /** The most-recently dismissed job — used to drive the undo banner. */
  undoTarget: UndoTarget | null
  /** Whether the filter input row is expanded (desktop only). */
  filterRowOpen: boolean
}

type Action =
  | { type: 'SET_SORT'; key: SortKey }
  | { type: 'SET_FILTER'; field: keyof FilterState; value: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'TOGGLE_FILTER_ROW' }
  | { type: 'DISMISS_JOB'; id: string; title: string }
  | { type: 'UNDO_DISMISS' }
  | { type: 'RESTORE_ALL' }
  | { type: 'CLEAR_UNDO_TARGET' }

const INITIAL_FILTERS: FilterState = {
  title: '',
  company: '',
  jobType: '',
  environment: '',
  salaryMin: '',
  salaryMax: '',
  scoreMin: '',
  source: '',
}

const INITIAL_STATE: ControlsState = {
  sort: { key: null, dir: 'asc' },
  filters: INITIAL_FILTERS,
  hiddenIds: new Set(),
  undoTarget: null,
  filterRowOpen: false,
}

function reducer(state: ControlsState, action: Action): ControlsState {
  switch (action.type) {
    case 'SET_SORT': {
      const sameKey = state.sort.key === action.key
      return {
        ...state,
        sort: {
          key: action.key,
          // Toggle direction when clicking the active column; default to asc otherwise.
          dir: sameKey ? (state.sort.dir === 'asc' ? 'desc' : 'asc') : 'asc',
        },
      }
    }

    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.field]: action.value },
      }

    case 'CLEAR_FILTERS':
      return { ...state, filters: INITIAL_FILTERS }

    case 'TOGGLE_FILTER_ROW':
      return { ...state, filterRowOpen: !state.filterRowOpen }

    case 'DISMISS_JOB': {
      const next = new Set(state.hiddenIds)
      next.add(action.id)
      return {
        ...state,
        hiddenIds: next,
        undoTarget: { id: action.id, title: action.title },
      }
    }

    case 'UNDO_DISMISS': {
      if (!state.undoTarget) return state
      const next = new Set(state.hiddenIds)
      next.delete(state.undoTarget.id)
      return { ...state, hiddenIds: next, undoTarget: null }
    }

    case 'RESTORE_ALL':
      return { ...state, hiddenIds: new Set(), undoTarget: null }

    case 'CLEAR_UNDO_TARGET':
      return { ...state, undoTarget: null }

    default:
      return state
  }
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

/**
 * Returns a numeric ordering value for null handling.
 * asc:  nulls sort last  → null gets +Infinity
 * desc: nulls sort first → null gets -Infinity (which becomes +Infinity after negation)
 */
function nullOrder(dir: SortDir): number {
  return dir === 'asc' ? Infinity : -Infinity
}

function compareRows(
  a: ProspectorSearchResult,
  b: ProspectorSearchResult,
  sort: SortState,
): number {
  if (!sort.key) return 0

  let av: string | number | null
  let bv: string | number | null

  switch (sort.key) {
    case 'title':
      av = a.title
      bv = b.title
      break
    case 'company_name':
      av = a.company_name
      bv = b.company_name
      break
    case 'job_type':
      av = a.job_type
      bv = b.job_type
      break
    case 'remote_type':
      av = a.remote_type
      bv = b.remote_type
      break
    case 'compensation_min':
      av = a.compensation_min
      bv = b.compensation_min
      break
    case 'match_score':
      av = a.match_score
      bv = b.match_score
      break
    case 'posted_at':
      // Compare as epoch ms so date strings sort correctly without locale issues.
      av = a.posted_at ? new Date(a.posted_at).getTime() : null
      bv = b.posted_at ? new Date(b.posted_at).getTime() : null
      break
    case 'created_at':
      av = a.created_at ? new Date(a.created_at).getTime() : null
      bv = b.created_at ? new Date(b.created_at).getTime() : null
      break
    case 'source_url':
      av = deriveSourceLabel(a.source_url)
      bv = deriveSourceLabel(b.source_url)
      break
  }

  // Null placement — see module docblock.
  const sentinel = nullOrder(sort.dir)
  const an = av === null || av === undefined ? sentinel : av
  const bn = bv === null || bv === undefined ? sentinel : bv

  let cmp: number
  if (typeof an === 'string' && typeof bn === 'string') {
    cmp = an.localeCompare(bn)
  } else if (typeof an === 'number' && typeof bn === 'number') {
    cmp = an - bn
  } else {
    // Mixed null/non-null after sentinel substitution — treat as equal.
    cmp = 0
  }

  if (cmp !== 0) return sort.dir === 'desc' ? -cmp : cmp

  // Stable tiebreak: secondary sort by title ascending.
  return a.title.localeCompare(b.title)
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function contains(haystack: string | null, needle: string): boolean {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function passesFilter(job: ProspectorSearchResult, f: FilterState): boolean {
  if (!contains(job.title, f.title)) return false
  if (!contains(job.company_name, f.company)) return false

  if (f.jobType && job.job_type !== f.jobType) return false
  if (f.environment && job.remote_type !== f.environment) return false

  const min = f.salaryMin === '' ? null : Number(f.salaryMin)
  const max = f.salaryMax === '' ? null : Number(f.salaryMax)

  if (min !== null && !isNaN(min)) {
    // The job must have SOME compensation that reaches the minimum.
    const jobMax = job.compensation_max ?? job.compensation_min
    if (jobMax === null || jobMax < min) return false
  }

  if (max !== null && !isNaN(max)) {
    // The job must have SOME compensation at or below the maximum.
    const jobMin = job.compensation_min ?? job.compensation_max
    if (jobMin === null || jobMin > max) return false
  }

  const scoreMin = f.scoreMin === '' ? null : Number(f.scoreMin)
  if (scoreMin !== null && !isNaN(scoreMin)) {
    if (job.match_score === null || job.match_score < scoreMin) return false
  }

  if (f.source && !contains(deriveSourceLabel(job.source_url), f.source)) return false

  return true
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface ProspectorTableControls {
  sort: SortState
  filters: FilterState
  hiddenIds: Set<string>
  undoTarget: UndoTarget | null
  filterRowOpen: boolean

  setSort: (key: SortKey) => void
  setFilter: (field: keyof FilterState, value: string) => void
  clearFilters: () => void
  toggleFilterRow: () => void
  dismissJob: (id: string, title: string) => void
  undoDismiss: () => void
  restoreAll: () => void
  clearUndoTarget: () => void

  /** Jobs after hiding, filtering, and sorting — the array the table renders. */
  displayJobs: ProspectorSearchResult[]
  /** True when any filter field has a value — drives "clear filters" affordance. */
  hasActiveFilters: boolean
}

export function useProspectorTableControls(
  jobs: ProspectorSearchResult[],
): ProspectorTableControls {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  const setSort = useCallback(
    (key: SortKey) => dispatch({ type: 'SET_SORT', key }),
    [],
  )

  const setFilter = useCallback(
    (field: keyof FilterState, value: string) =>
      dispatch({ type: 'SET_FILTER', field, value }),
    [],
  )

  const clearFilters = useCallback(() => dispatch({ type: 'CLEAR_FILTERS' }), [])

  const toggleFilterRow = useCallback(
    () => dispatch({ type: 'TOGGLE_FILTER_ROW' }),
    [],
  )

  const dismissJob = useCallback(
    (id: string, title: string) => dispatch({ type: 'DISMISS_JOB', id, title }),
    [],
  )

  const undoDismiss = useCallback(
    () => dispatch({ type: 'UNDO_DISMISS' }),
    [],
  )

  const restoreAll = useCallback(
    () => dispatch({ type: 'RESTORE_ALL' }),
    [],
  )

  const clearUndoTarget = useCallback(
    () => dispatch({ type: 'CLEAR_UNDO_TARGET' }),
    [],
  )

  const displayJobs = useMemo(() => {
    const visible = jobs.filter(
      (j) => !state.hiddenIds.has(j.id) && passesFilter(j, state.filters),
    )
    if (!state.sort.key) return visible
    return [...visible].sort((a, b) => compareRows(a, b, state.sort))
  }, [jobs, state.hiddenIds, state.filters, state.sort])

  const hasActiveFilters = useMemo(
    () => Object.values(state.filters).some((v) => v !== ''),
    [state.filters],
  )

  return {
    sort: state.sort,
    filters: state.filters,
    hiddenIds: state.hiddenIds,
    undoTarget: state.undoTarget,
    filterRowOpen: state.filterRowOpen,

    setSort,
    setFilter,
    clearFilters,
    toggleFilterRow,
    dismissJob,
    undoDismiss,
    restoreAll,
    clearUndoTarget,

    displayJobs,
    hasActiveFilters,
  }
}
