/**
 * Shared pagination contract — Phase A server-side (`.range()`) pagination.
 *
 * All paginated list surfaces (Dashboard applications, Prospector search
 * results, Prospector ready-to-apply queue) fetch one page of `PAGE_SIZE`
 * rows plus an exact total count from a `{ count: 'exact' }` query, so page
 * controls and tab badges stay accurate independent of the current page.
 *
 * Pure utilities (no React) — lives in lib/ per the source-directory contract
 * (src/hooks/ is reserved for shared hooks).
 */

/** Page size for every paginated list surface (limit=50). */
export const PAGE_SIZE = 50

/** One page of results plus the metadata needed to render page controls. */
export interface Paginated<T> {
  rows: T[]
  totalCount: number
  page: number
  pageSize: number
  pageCount: number
}

/** Total number of pages for a row count + page size (always >= 1). */
export function getPageCount(totalCount: number, pageSize: number = PAGE_SIZE): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalCount / pageSize))
}

/**
 * Inclusive `[from, to]` bounds for Supabase `.range()` for a zero-based page.
 * e.g. page 0 -> [0, 49], page 1 -> [50, 99] at PAGE_SIZE = 50.
 */
export function pageRange(
  page: number,
  pageSize: number = PAGE_SIZE,
): { from: number; to: number } {
  const safePage = Math.max(0, page)
  const from = safePage * pageSize
  return { from, to: from + pageSize - 1 }
}
