/**
 * detectAtsFamily — pure host → {family, antibotTier} resolution.
 *
 * Extends _shared/submission/resolveChannel.detectAtsVendor's documented host
 * logic to the wider prep vocabulary, adding smartrecruiters (low tier) and
 * workday (high tier — a defended platform we never headless-read). Unknown
 * hosts resolve to {'other','unknown'}. Pure + side-effect free (no I/O, no
 * Deno.*), so it is unit-testable without a runtime.
 *
 * Anti-bot tier per the shared contract:
 *   greenhouse / lever / ashby / smartrecruiters → 'low'
 *   workday                                       → 'high'
 *   other                                         → 'unknown'
 *
 * Documented public board hosts:
 *   greenhouse      → boards.greenhouse.io / job-boards.greenhouse.io
 *   lever           → jobs.lever.co
 *   ashby           → jobs.ashbyhq.com / *.ashbyhq.com
 *   smartrecruiters → jobs.smartrecruiters.com / careers.smartrecruiters.com /
 *                     api.smartrecruiters.com / *.smartrecruiters.com
 *   workday         → *.myworkdayjobs.com / *.workday.com
 */

import type { AntibotTier, AtsFamily } from './types.ts'

export interface DetectedFamily {
  family: AtsFamily
  antibotTier: AntibotTier
}

/** family → anti-bot tier, per the shared contract. Single source for the map. */
export function antibotTierForFamily(family: AtsFamily): AntibotTier {
  switch (family) {
    case 'greenhouse':
    case 'lever':
    case 'ashby':
    case 'smartrecruiters':
      return 'low'
    case 'workday':
      return 'high'
    case 'other':
      return 'unknown'
  }
}

/**
 * Detects the ATS family from a source URL's host. Never throws — an
 * unparseable URL yields {'other','unknown'} (callers fall back to manual).
 */
export function detectAtsFamily(url: string): DetectedFamily {
  let host: string
  try {
    host = new URL(url).host.toLowerCase()
  } catch {
    return { family: 'other', antibotTier: 'unknown' }
  }

  const family = familyForHost(host)
  return { family, antibotTier: antibotTierForFamily(family) }
}

/** Host → family, exact-match-first then documented subdomain suffixes. */
function familyForHost(host: string): AtsFamily {
  // Greenhouse public job boards (exact hosts only — subdomains are not boards).
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return 'greenhouse'
  }

  // Lever public postings (exact host only).
  if (host === 'jobs.lever.co') {
    return 'lever'
  }

  // Ashby — canonical host plus any *.ashbyhq.com subdomain.
  if (host === 'ashbyhq.com' || host === 'jobs.ashbyhq.com' || host.endsWith('.ashbyhq.com')) {
    return 'ashby'
  }

  // SmartRecruiters — jobs/careers/api hosts plus any *.smartrecruiters.com.
  if (host === 'smartrecruiters.com' || host.endsWith('.smartrecruiters.com')) {
    return 'smartrecruiters'
  }

  // Workday — high anti-bot tier; *.myworkdayjobs.com and *.workday.com.
  if (
    host === 'myworkdayjobs.com' ||
    host.endsWith('.myworkdayjobs.com') ||
    host === 'workday.com' ||
    host.endsWith('.workday.com')
  ) {
    return 'workday'
  }

  return 'other'
}
