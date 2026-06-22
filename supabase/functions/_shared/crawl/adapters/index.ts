/**
 * Adapter registry — dispatch a board's raw list payload to the right pure
 * parser. Unknown / non-v1 families return [] (never throws).
 */

import type { BoardRef, CrawlFamily, UnifiedPosting } from '../types.ts'
import { parseGreenhouseList } from './greenhouse.ts'
import { parseLeverList } from './lever.ts'
import { parseAshbyList } from './ashby.ts'

export function parseList(family: string, raw: unknown, board: BoardRef): UnifiedPosting[] {
  switch (family) {
    case 'greenhouse':
      return parseGreenhouseList(raw, board)
    case 'lever':
      return parseLeverList(raw, board)
    case 'ashby':
      return parseAshbyList(raw, board)
    default:
      return []
  }
}

/** True for the HTTP-only families the v1 crawler ingests. */
export function isCrawlable(family: string): family is CrawlFamily {
  return family === 'greenhouse' || family === 'lever' || family === 'ashby'
}

export { parseGreenhouseList, parseLeverList, parseAshbyList }
