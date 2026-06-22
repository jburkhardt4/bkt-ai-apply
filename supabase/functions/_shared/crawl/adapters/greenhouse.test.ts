import { describe, expect, it } from 'vitest'
import { parseGreenhouseList } from './greenhouse.ts'
import type { BoardRef } from '../types.ts'

const board: BoardRef = { id: 'b1', ats_family: 'greenhouse', board_token: 'acme', display_name: 'Acme' }

describe('parseGreenhouseList', () => {
  it('maps a job, decodes entity-encoded content, and parses salary from text', () => {
    const raw = {
      jobs: [
        {
          id: 123,
          title: 'Senior Software Engineer',
          absolute_url: 'https://boards.greenhouse.io/acme/jobs/123',
          location: { name: 'Remote - US' },
          departments: [{ name: 'Engineering' }],
          content: '&lt;p&gt;Comp: $120,000 - $150,000&lt;/p&gt;',
          updated_at: '2024-01-15T00:00:00Z',
        },
      ],
    }
    const [p] = parseGreenhouseList(raw, board)
    expect(p.external_job_id).toBe('123')
    expect(p.title).toBe('Senior Software Engineer')
    expect(p.application_url).toBe('https://boards.greenhouse.io/acme/jobs/123')
    expect(p.company_name).toBe('Acme')
    expect(p.department).toBe('Engineering')
    expect(p.remote_type).toBe('remote')
    expect(p.description_text).toBe('Comp: $120,000 - $150,000')
    expect(p.salary_min).toBe(120000)
    expect(p.salary_max).toBe(150000)
    expect(p.posted_at).toBe(new Date('2024-01-15T00:00:00Z').toISOString())
  })

  it('skips unusable rows and tolerates malformed payloads', () => {
    expect(parseGreenhouseList({ jobs: [{ id: 1 }] }, board)).toEqual([]) // no title/url
    expect(parseGreenhouseList(null, board)).toEqual([])
    expect(parseGreenhouseList({}, board)).toEqual([])
  })
})
