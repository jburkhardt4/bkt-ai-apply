/**
 * Ashby list adapter — pure parser for the Posting API job board
 * (GET /posting-api/job-board/{org}?includeCompensation=true). Returns
 * { jobs: [...] }; we keep only isListed !== false. Compensation is a tiered
 * structure; we best-effort parse a range from its summary string.
 * No I/O — vitest-testable.
 */

import type { BoardRef, UnifiedPosting } from '../types.ts'
import { buildPosting, parseSalaryFromText } from '../normalize.ts'

interface AshbyJob {
  id?: string
  title?: string
  location?: string
  department?: string
  team?: string
  isListed?: boolean
  isRemote?: boolean
  employmentType?: string
  descriptionHtml?: string
  descriptionPlain?: string
  jobUrl?: string
  applyUrl?: string
  publishedAt?: string
  publishedDate?: string
  updatedAt?: string
  compensation?: {
    compensationTierSummary?: string
  }
}

interface AshbyList {
  jobs?: AshbyJob[]
}

export function parseAshbyList(raw: unknown, board: BoardRef): UnifiedPosting[] {
  const jobs = (raw as AshbyList | null)?.jobs
  if (!Array.isArray(jobs)) return []

  const out: UnifiedPosting[] = []
  for (const j of jobs) {
    if (j.isListed === false) continue
    const sal = parseSalaryFromText(j.compensation?.compensationTierSummary ?? '')
    const post = buildPosting({
      ats_family: 'ashby',
      external_job_id: j.id ?? null,
      title: j.title ?? null,
      application_url: j.applyUrl ?? j.jobUrl ?? null,
      external_url: j.jobUrl ?? null,
      company_name: board.display_name ?? null,
      location_raw: j.location ?? null,
      department: j.department ?? null,
      team: j.team ?? null,
      employment_type: j.employmentType ?? null,
      description_html: j.descriptionHtml ?? null,
      description_text: j.descriptionPlain ?? null,
      // Only a positive isRemote is authoritative; otherwise let text classify.
      remote_hint: j.isRemote === true ? 'remote' : null,
      salary_min: sal.min,
      salary_max: sal.max,
      salary_currency: sal.currency,
      salary_interval: sal.interval,
      posted_at: j.publishedAt ?? j.publishedDate ?? j.updatedAt ?? null,
    })
    if (post) out.push(post)
  }
  return out
}
