/**
 * buildReadEndpoint — pure resolution of a posting URL to its PUBLIC, AUTH-FREE
 * read-API endpoint per ATS family. Used by the prepare-application edge function
 * to fetch a form schema WITHOUT a provider key or headless browser.
 *
 * Greenhouse / Lever / Ashby / SmartRecruiters expose documented, anonymous GET
 * endpoints for posting + form metadata. Workday and 'other' are defended /
 * undocumented — we return null (unsupported) and NEVER headless-read them
 * (BR-122 / anti-bot policy). This keeps Auto-mode prep on read-API surfaces only.
 *
 * Pure + side-effect free (no I/O, no Deno.*), so it is unit-testable. The
 * board-identifier resolvers mirror _shared/submission/atsAdapters.ts but read
 * NO env (the prep layer takes identifiers straight from the public URL path).
 *
 * ── Documented public read endpoints (cited) ────────────────────────────────
 * Greenhouse Job Board API v1:
 *   GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?questions=true
 * Lever Postings API:
 *   GET https://api.lever.co/v0/postings/{site}/{postingId}?mode=json
 * Ashby Posting API:
 *   POST https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true  (board list)
 *   GET  https://jobs.ashbyhq.com/api/non-user-graphql ... — the documented stable
 *        surface is the posting-api job board; the per-posting form definition
 *        (applicationFormDefinition/info formFields/sections) is fetched by id.
 *        We target the posting-api single-posting endpoint by org + postingId.
 * SmartRecruiters Posting API:
 *   GET https://api.smartrecruiters.com/v1/companies/{company}/postings/{postingId}/configuration
 *
 * NOTE (live-tune): exact query params / response envelopes for Ashby and
 * SmartRecruiters are UNVERIFIED here and must be confirmed against a live
 * posting; the parsers in schemaParse.ts are written defensively to tolerate
 * shape drift.
 */

import type { AtsFamily } from './types.ts'

export interface BoardIdentifiers {
  /** Greenhouse board token / Lever site / Ashby org / SmartRecruiters company. */
  org: string
  /** Greenhouse job id / Lever posting id / Ashby posting id / SR posting id. */
  postingId: string
}

export interface ReadEndpoint {
  url: string
  method: 'GET' | 'POST'
  body?: string
}

/** Splits a URL path into non-empty segments; [] on parse failure. */
function pathParts(url: string): string[] {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Resolves {org, postingId} from a public posting URL for read-API families.
 * Returns null for families we do not read (workday/other) or when identifiers
 * cannot be recovered from the path.
 */
export function resolveBoardIdentifiers(
  family: AtsFamily,
  url: string,
): BoardIdentifiers | null {
  const parts = pathParts(url)

  switch (family) {
    case 'greenhouse': {
      // boards.greenhouse.io/{board_token}/jobs/{job_id}
      const org = parts[0] ?? ''
      const jobsIdx = parts.indexOf('jobs')
      const postingId = jobsIdx >= 0 ? (parts[jobsIdx + 1] ?? '') : ''
      return org && postingId ? { org, postingId } : null
    }
    case 'lever': {
      // jobs.lever.co/{site}/{postingId}
      const org = parts[0] ?? ''
      const postingId = parts[1] ?? ''
      return org && postingId ? { org, postingId } : null
    }
    case 'ashby': {
      // jobs.ashbyhq.com/{org}/{postingId}
      const org = parts[0] ?? ''
      const postingId = parts[1] ?? ''
      return org && postingId ? { org, postingId } : null
    }
    case 'smartrecruiters': {
      // jobs.smartrecruiters.com/{company}/{postingId}  (postingId often numeric)
      const org = parts[0] ?? ''
      const postingId = parts[1] ?? ''
      return org && postingId ? { org, postingId } : null
    }
    case 'workday':
    case 'other':
      return null
  }
}

/**
 * Builds the public read-API request for a family + identifiers. Returns null
 * for unsupported families (workday/other) — the edge function then prepares a
 * manual-fallback record rather than reading a defended platform.
 */
export function buildReadEndpoint(
  family: AtsFamily,
  ids: BoardIdentifiers,
): ReadEndpoint | null {
  const org = encodeURIComponent(ids.org)
  const postingId = encodeURIComponent(ids.postingId)

  switch (family) {
    case 'greenhouse':
      return {
        url: `https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${postingId}?questions=true`,
        method: 'GET',
      }
    case 'lever':
      return {
        url: `https://api.lever.co/v0/postings/${org}/${postingId}?mode=json`,
        method: 'GET',
      }
    case 'ashby':
      // posting-api single posting by org + postingId (board surface, auth-free).
      return {
        url: `https://api.ashbyhq.com/posting-api/job-board/${org}/${postingId}`,
        method: 'GET',
      }
    case 'smartrecruiters':
      return {
        url: `https://api.smartrecruiters.com/v1/companies/${org}/postings/${postingId}/configuration`,
        method: 'GET',
      }
    case 'workday':
    case 'other':
      // Defended / undocumented — never headless-read (BR-122, anti-bot policy).
      return null
  }
}
