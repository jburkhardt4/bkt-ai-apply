/**
 * Shared field-formatting helpers for the Prospector "Job Search Results" UI.
 *
 * Extracted into a non-component module so both ProspectorSearchResults (list)
 * and ProspectorJobSheet (detail panel) consume identical formatting with no
 * drift. Lives in a plain .ts file because react-refresh/only-export-components
 * forbids non-component exports from a .tsx component module.
 */

/** Environment badge color classes, keyed by jobs.remote_type. */
export const REMOTE_BADGE_CLASSES: Record<string, string> = {
  remote: 'bg-green-500/15 text-green-700 dark:text-green-400',
  hybrid: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  onsite: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
}

/** Formats compensation_min/max integers into a compact "$73K–$97K" label. */
export function formatCompensation(min: number | null, max: number | null): string | null {
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`)
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`
  if (min != null) return `${fmt(min)}+`
  if (max != null) return `Up to ${fmt(max)}`
  return null
}

/** Formats an ISO timestamp into a relative "2 days ago" label; "—" when null. */
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—'
  const posted = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - posted.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}

/**
 * Formats a job_type string for display, capitalizing the first letter.
 * Returns null when the input is null (callers render "—" or "Not Disclosed").
 */
export function formatJobType(type: string | null): string | null {
  if (!type) return null
  return type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Derives a short display label from a source URL hostname.
 * dice.com → "Dice", linkedin.com → "LinkedIn", etc.
 * Falls back to "Apply Now" when the hostname can't be parsed.
 */
export function deriveSourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const KNOWN: Record<string, string> = {
      'dice.com': 'Dice',
      'linkedin.com': 'LinkedIn',
      'indeed.com': 'Indeed',
      'glassdoor.com': 'Glassdoor',
      'lever.co': 'Lever',
      'greenhouse.io': 'Greenhouse',
      'workday.com': 'Workday',
      'myworkdayjobs.com': 'Workday',
      'icims.com': 'iCIMS',
      'smartrecruiters.com': 'SmartRecruiters',
      'jobvite.com': 'Jobvite',
      'ashbyhq.com': 'Ashby',
      'jobs.ashbyhq.com': 'Ashby',
      'boards.greenhouse.io': 'Greenhouse',
      'apply.workable.com': 'Workable',
      'ziprecruiter.com': 'ZipRecruiter',
      'monster.com': 'Monster',
      'simplyhired.com': 'SimplyHired',
      'wellfound.com': 'Wellfound',
      'angel.co': 'Wellfound',
    }
    if (KNOWN[host]) return KNOWN[host]
    // Capitalize first segment of unknown hostname: "careers.acme.com" → "Careers"
    const segment = host.split('.')[0]
    return segment.charAt(0).toUpperCase() + segment.slice(1)
  } catch {
    return 'Apply Now'
  }
}
