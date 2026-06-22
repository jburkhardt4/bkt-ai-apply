import { describe, expect, it } from 'vitest'
import { parseAshbyList } from './ashby.ts'
import type { BoardRef } from '../types.ts'

const board: BoardRef = { id: 'b1', ats_family: 'ashby', board_token: 'acme', display_name: 'Acme' }

describe('parseAshbyList', () => {
  it('maps listed jobs and parses compensation summary', () => {
    const raw = {
      jobs: [
        {
          id: 'j1',
          title: 'Backend Engineer',
          location: 'New York',
          department: 'Engineering',
          team: 'Platform',
          isListed: true,
          isRemote: true,
          employmentType: 'FullTime',
          descriptionHtml: '<p>Join us</p>',
          descriptionPlain: 'Join us',
          jobUrl: 'https://jobs.ashbyhq.com/acme/j1',
          applyUrl: 'https://jobs.ashbyhq.com/acme/j1/application',
          publishedAt: '2024-02-01T00:00:00Z',
          compensation: { compensationTierSummary: '$140K – $180K' },
        },
      ],
    }
    const [p] = parseAshbyList(raw, board)
    expect(p.external_job_id).toBe('j1')
    expect(p.title).toBe('Backend Engineer')
    expect(p.application_url).toBe('https://jobs.ashbyhq.com/acme/j1/application')
    expect(p.external_url).toBe('https://jobs.ashbyhq.com/acme/j1')
    expect(p.department).toBe('Engineering')
    expect(p.team).toBe('Platform')
    expect(p.remote_type).toBe('remote')
    expect(p.salary_min).toBe(140000)
    expect(p.salary_max).toBe(180000)
    expect(p.posted_at).toBe(new Date('2024-02-01T00:00:00Z').toISOString())
  })

  it('skips unlisted jobs and tolerates malformed payloads', () => {
    const raw = {
      jobs: [
        { id: 'hidden', title: 'X', applyUrl: 'https://jobs.ashbyhq.com/acme/x', isListed: false },
        { id: 'shown', title: 'Y', applyUrl: 'https://jobs.ashbyhq.com/acme/y', isListed: true },
      ],
    }
    const out = parseAshbyList(raw, board)
    expect(out).toHaveLength(1)
    expect(out[0].external_job_id).toBe('shown')
    expect(parseAshbyList(null, board)).toEqual([])
  })
})
