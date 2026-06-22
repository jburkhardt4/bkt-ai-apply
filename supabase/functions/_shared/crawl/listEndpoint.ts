/**
 * listEndpoint — pure board-level list-URL builder. The deliberate twin of
 * _shared/prep/buildReadEndpoint.ts (which resolves a SINGLE posting's read
 * URL); this resolves a whole board's listing endpoint for ingestion.
 *
 * Documented, auth-free JSON list APIs (ADR-015):
 *   Greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever:      GET https://api.lever.co/v0/postings/{site}?mode=json&limit&skip
 *   Ashby:      GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 *   Workday/other: null — not crawled in v1 (deferred / never headless, BR-032/033/034).
 *
 * No I/O, no Deno.* — unit-testable.
 */

import type { BoardRef, Cursor, ListRequest } from './types.ts'

/** Lever is the only paginated family; page size for skip/limit. */
export const LEVER_PAGE_LIMIT = 100

function enc(s: string): string {
  return encodeURIComponent(s)
}

/** Resolve the list request for a board + optional pagination cursor. */
export function buildListEndpoint(board: BoardRef, cursor?: Cursor | null): ListRequest | null {
  const headers: Record<string, string> = {}
  if (board.last_etag) headers['If-None-Match'] = board.last_etag

  switch (board.ats_family) {
    case 'greenhouse':
      return {
        url: `https://boards-api.greenhouse.io/v1/boards/${enc(board.board_token)}/jobs?content=true`,
        method: 'GET',
        headers,
      }
    case 'lever': {
      const skip = cursor?.offset ?? 0
      return {
        url: `https://api.lever.co/v0/postings/${enc(board.board_token)}?mode=json&limit=${LEVER_PAGE_LIMIT}&skip=${skip}`,
        method: 'GET',
        headers,
      }
    }
    case 'ashby':
      return {
        url: `https://api.ashbyhq.com/posting-api/job-board/${enc(board.board_token)}?includeCompensation=true`,
        method: 'GET',
        headers,
      }
    default:
      return null
  }
}

/**
 * Next pagination cursor given the just-fetched raw page. Only Lever paginates:
 * a full page (length === LEVER_PAGE_LIMIT) implies there may be more, so advance
 * skip; a short/empty page ends the enumeration. All others are single-page.
 */
export function nextCursor(family: string, raw: unknown, prev?: Cursor | null): Cursor | null {
  if (family !== 'lever') return null
  const len = Array.isArray(raw) ? raw.length : 0
  if (len === LEVER_PAGE_LIMIT) return { offset: (prev?.offset ?? 0) + LEVER_PAGE_LIMIT }
  return null
}
