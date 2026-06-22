/**
 * discovery — pure board-token extraction from a public posting URL. Reuses
 * _shared/prep/atsFamily.detectAtsFamily for host→family, then recovers the
 * board identifier from the path. Used by crawler-discover to harvest boards
 * from existing jobs.source_url rows (the prospector already ingests GH/Ashby
 * URLs). HTTP-only v1 families only (greenhouse/lever/ashby); others → null.
 *
 * No I/O, no Deno.* — unit-testable.
 */

import { detectAtsFamily } from '../prep/atsFamily.ts'
import type { CrawlFamily } from './types.ts'

export interface DiscoveredBoard {
  ats_family: CrawlFamily
  board_token: string
}

/** Recover {ats_family, board_token} from a public posting URL, or null. */
export function extractBoardRef(url: string): DiscoveredBoard | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.host.toLowerCase()
  const parts = u.pathname.split('/').filter(Boolean)
  const family = detectAtsFamily(url).family

  switch (family) {
    case 'greenhouse': {
      // boards.greenhouse.io/{token}/jobs/{id} | job-boards.greenhouse.io/{token}/...
      const token = parts[0]
      return token ? { ats_family: 'greenhouse', board_token: token } : null
    }
    case 'lever': {
      // jobs.lever.co/{site}/{id}
      const token = parts[0]
      return token ? { ats_family: 'lever', board_token: token } : null
    }
    case 'ashby': {
      // jobs.ashbyhq.com/{org}/{id}  OR  {org}.ashbyhq.com/...
      if (host === 'jobs.ashbyhq.com' || host === 'ashbyhq.com') {
        const token = parts[0]
        return token ? { ats_family: 'ashby', board_token: token } : null
      }
      const sub = host.endsWith('.ashbyhq.com') ? host.slice(0, -'.ashbyhq.com'.length) : ''
      return sub && sub !== 'jobs' ? { ats_family: 'ashby', board_token: sub } : null
    }
    default:
      // smartrecruiters / workday / other are not crawled in v1.
      return null
  }
}
