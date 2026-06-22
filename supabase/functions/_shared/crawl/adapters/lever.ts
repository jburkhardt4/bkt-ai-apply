/**
 * Lever list adapter — pure parser for the Postings API (GET /v0/postings/{site}
 * ?mode=json). Returns a flat array; descriptions are real HTML plus a
 * descriptionPlain; salaryRange + workplaceType + createdAt(ms) are present.
 * No I/O — vitest-testable.
 */

import type { BoardRef, UnifiedPosting } from '../types.ts'
import { buildPosting } from '../normalize.ts'

interface LeverPosting {
  id?: string
  text?: string
  hostedUrl?: string
  applyUrl?: string
  categories?: {
    location?: string
    team?: string
    department?: string
    commitment?: string
  }
  description?: string
  descriptionPlain?: string
  workplaceType?: string
  createdAt?: number
  salaryRange?: {
    currency?: string
    interval?: string
    min?: number
    max?: number
  }
}

export function parseLeverList(raw: unknown, board: BoardRef): UnifiedPosting[] {
  if (!Array.isArray(raw)) return []

  const out: UnifiedPosting[] = []
  for (const p of raw as LeverPosting[]) {
    const post = buildPosting({
      ats_family: 'lever',
      external_job_id: p.id ?? null,
      title: p.text ?? null,
      application_url: p.applyUrl ?? p.hostedUrl ?? null,
      external_url: p.hostedUrl ?? null,
      company_name: board.display_name ?? null,
      location_raw: p.categories?.location ?? null,
      team: p.categories?.team ?? null,
      department: p.categories?.department ?? null,
      employment_type: p.categories?.commitment ?? null,
      description_html: p.description ?? null,
      description_text: p.descriptionPlain ?? null,
      remote_hint: p.workplaceType ?? null,
      salary_min: p.salaryRange?.min ?? null,
      salary_max: p.salaryRange?.max ?? null,
      salary_currency: p.salaryRange?.currency ?? null,
      salary_interval: p.salaryRange?.interval ?? null,
      posted_at: p.createdAt ?? null,
    })
    if (post) out.push(post)
  }
  return out
}
