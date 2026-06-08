/**
 * useProspectorColumnOrder
 *
 * Manages column ordering state for the ProspectorSearchResults desktop table.
 * Responsibilities:
 *   - Defines the canonical column-definition model (ColumnDef)
 *   - Owns the default column order
 *   - Persists order to localStorage (key: prospector_column_order_v2)
 *   - Falls back to in-memory default if localStorage is unavailable or stale
 *   - Provides moveColumn (drag/keyboard reorder) and resetOrder actions
 *
 * Scope: desktop table only. Mobile card layout is unaffected.
 * Dependencies: none beyond React.
 * No arbitrary Tailwind values — all widthClass / minWidthClass values are
 * standard Tailwind spacing/sizing tokens.
 *
 * Skills applied: design-taste-frontend, emil-design-eng
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { SortKey } from './useProspectorTableControls'

// ── Column definition model ───────────────────────────────────────────────────

export type ColumnId =
  | 'company'
  | 'title'
  | 'matchScore'
  | 'jobType'
  | 'environment'
  | 'salary'
  | 'posted'
  | 'dateCreated'

export type FilterType = 'text' | 'select' | 'salary-range' | 'score' | 'none'

export interface ColumnDef {
  /** Stable identifier — never changes; used as React key and DnD source/target. */
  id: ColumnId
  /** Display label in the header. */
  label: string
  /** Undefined = column is not sortable. */
  sortKey?: SortKey
  /**
   * Tailwind class for the <col> proportional width.
   * Tokens only — no arbitrary values.
   */
  widthClass: string
  /**
   * Optional additional Tailwind min-width class applied to the <th> and <td>.
   * Tokens only — e.g. min-w-28, min-w-24.
   */
  minWidthClass?: string
  /** Drives which filter control renders in the filter row. */
  filterType: FilterType
}

// ── Column definitions (single source of truth) ───────────────────────────────

export const COLUMN_DEFS: Record<ColumnId, ColumnDef> = {
  company: {
    id: 'company',
    label: 'Company',
    sortKey: 'company_name',
    widthClass: 'w-1/6',
    filterType: 'text',
  },
  title: {
    id: 'title',
    label: 'Job Title',
    sortKey: 'title',
    widthClass: 'w-1/4',
    filterType: 'text',
  },
  matchScore: {
    id: 'matchScore',
    label: 'Match Score',
    sortKey: 'match_score',
    widthClass: 'w-1/12',
    filterType: 'score',
  },
  jobType: {
    id: 'jobType',
    label: 'Job Type',
    sortKey: 'job_type',
    widthClass: 'w-1/12',
    minWidthClass: 'min-w-28',
    filterType: 'select',
  },
  environment: {
    id: 'environment',
    label: 'Environment',
    sortKey: 'remote_type',
    widthClass: 'w-1/12',
    minWidthClass: 'min-w-24',
    filterType: 'select',
  },
  salary: {
    id: 'salary',
    label: 'Salary',
    sortKey: 'compensation_min',
    widthClass: 'w-1/6',
    filterType: 'salary-range',
  },
  posted: {
    id: 'posted',
    label: 'Date Posted',
    sortKey: 'posted_at',
    widthClass: 'w-1/12',
    filterType: 'none',
  },
  dateCreated: {
    id: 'dateCreated',
    label: 'Date Created',
    sortKey: 'created_at',
    widthClass: 'w-1/12',
    filterType: 'none',
  },
}

// ── Default column order (AC §2) ──────────────────────────────────────────────
// Exact order: Job Title, Company, Match Score, Job Type, Environment, Salary,
// Date Posted, Date Created

export const DEFAULT_COLUMN_ORDER: ColumnId[] = [
  'title',
  'company',
  'matchScore',
  'jobType',
  'environment',
  'salary',
  'posted',
  'dateCreated',
]

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = 'prospector_column_order_v2'

function readFromStorage(): ColumnId[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    // Validate: must be an array of exactly the expected ColumnId values.
    if (!Array.isArray(parsed)) return null
    const validIds = new Set<string>(DEFAULT_COLUMN_ORDER)
    // Must contain every expected id exactly once, no extras, no missing.
    if (parsed.length !== DEFAULT_COLUMN_ORDER.length) return null
    const seen = new Set<string>()
    for (const item of parsed) {
      if (typeof item !== 'string') return null
      if (!validIds.has(item)) return null
      if (seen.has(item)) return null
      seen.add(item)
    }
    return parsed as ColumnId[]
  } catch {
    return null
  }
}

function writeToStorage(order: ColumnId[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(order))
  } catch {
    // localStorage unavailable (private mode, quota exceeded) — silently ignore.
    // In-memory order remains correct.
  }
}

function clearFromStorage(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    // silent
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

interface ColumnOrderState {
  order: ColumnId[]
}

type ColumnOrderAction =
  | { type: 'MOVE_COLUMN'; fromIndex: number; toIndex: number }
  | { type: 'RESET_ORDER' }

function columnOrderReducer(
  state: ColumnOrderState,
  action: ColumnOrderAction,
): ColumnOrderState {
  switch (action.type) {
    case 'MOVE_COLUMN': {
      const { fromIndex, toIndex } = action
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.order.length ||
        toIndex >= state.order.length
      ) {
        return state
      }
      const next = [...state.order]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return { order: next }
    }

    case 'RESET_ORDER':
      return { order: [...DEFAULT_COLUMN_ORDER] }

    default:
      return state
  }
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface ProspectorColumnOrderControls {
  /** Ordered array of column IDs — maps directly to rendered columns. */
  columnOrder: ColumnId[]
  /** Ordered array of ColumnDef objects — ready for the table to map over. */
  orderedColumns: ColumnDef[]
  /** Move a column from one index to another (used by DnD and keyboard). */
  moveColumn: (fromIndex: number, toIndex: number) => void
  /** Restore the default order and clear localStorage. */
  resetOrder: () => void
  /** True when current order differs from DEFAULT_COLUMN_ORDER. */
  isNonDefaultOrder: boolean
}

export function useProspectorColumnOrder(): ProspectorColumnOrderControls {
  const [state, dispatch] = useReducer(columnOrderReducer, undefined, () => {
    // Lazy initializer: prefer persisted order; fall back to default.
    const persisted = readFromStorage()
    return { order: persisted ?? [...DEFAULT_COLUMN_ORDER] }
  })

  // Sync to localStorage whenever order changes.
  useEffect(() => {
    writeToStorage(state.order)
  }, [state.order])

  const moveColumn = useCallback(
    (fromIndex: number, toIndex: number) =>
      dispatch({ type: 'MOVE_COLUMN', fromIndex, toIndex }),
    [],
  )

  const resetOrder = useCallback(() => {
    clearFromStorage()
    dispatch({ type: 'RESET_ORDER' })
  }, [])

  const orderedColumns = useMemo(
    () => state.order.map((id) => COLUMN_DEFS[id]),
    [state.order],
  )

  const isNonDefaultOrder = useMemo(
    () =>
      state.order.length !== DEFAULT_COLUMN_ORDER.length ||
      state.order.some((id, i) => id !== DEFAULT_COLUMN_ORDER[i]),
    [state.order],
  )

  return {
    columnOrder: state.order,
    orderedColumns,
    moveColumn,
    resetOrder,
    isNonDefaultOrder,
  }
}
