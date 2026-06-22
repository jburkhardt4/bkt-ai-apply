/**
 * Greenhouse list adapter — pure parser for the Job Board API v1 list response
 * (GET /v1/boards/{token}/jobs?content=true). `content` is HTML-entity-encoded,
 * so we decode it once into real HTML; buildPosting derives plaintext from there.
 * No I/O — vitest-testable with a captured payload.
 */

import type { BoardRef, UnifiedPosting } from '../types.ts'
import { buildPosting, decodeEntities } from '../normalize.ts'

interface GreenhouseJob {
  id?: number | string
  title?: string
  absolute_url?: string
  content?: string
  updated_at?: string
  location?: { name?: string }
  departments?: Array<{ name?: string }>
}

interface GreenhouseList {
  jobs?: GreenhouseJob[]
}

export function parseGreenhouseList(raw: unknown, board: BoardRef): UnifiedPosting[] {
  const jobs = (raw as GreenhouseList | null)?.jobs
  if (!Array.isArray(jobs)) return []

  const out: UnifiedPosting[] = []
  for (const j of jobs) {
    const department = j.departments?.find((d) => d?.name)?.name ?? null
    const post = buildPosting({
      ats_family: 'greenhouse',
      external_job_id: j.id != null ? String(j.id) : null,
      title: j.title ?? null,
      application_url: j.absolute_url ?? null,
      external_url: j.absolute_url ?? null,
      company_name: board.display_name ?? null,
      location_raw: j.location?.name ?? null,
      department,
      // Greenhouse double-encodes the HTML; decode once to real markup.
      description_html: j.content ? decodeEntities(j.content) : null,
      posted_at: j.updated_at ?? null,
    })
    if (post) out.push(post)
  }
  return out
}
