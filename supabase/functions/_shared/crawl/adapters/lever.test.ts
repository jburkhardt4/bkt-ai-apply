import { describe, expect, it } from 'vitest'
import { parseLeverList } from './lever.ts'
import type { BoardRef } from '../types.ts'

const board: BoardRef = { id: 'b1', ats_family: 'lever', board_token: 'acme', display_name: 'Acme' }

describe('parseLeverList', () => {
  it('maps a posting with categories, salaryRange, and workplaceType', () => {
    const raw = [
      {
        id: 'abc-123',
        text: 'Product Designer',
        hostedUrl: 'https://jobs.lever.co/acme/abc-123',
        applyUrl: 'https://jobs.lever.co/acme/abc-123/apply',
        categories: { location: 'San Francisco', team: 'Design', department: 'Product', commitment: 'Full-time' },
        description: '<p>Build things</p>',
        descriptionPlain: 'Build things',
        workplaceType: 'hybrid',
        createdAt: 1700000000000,
        salaryRange: { currency: 'USD', interval: 'per-year-salary', min: 130000, max: 160000 },
      },
    ]
    const [p] = parseLeverList(raw, board)
    expect(p.external_job_id).toBe('abc-123')
    expect(p.title).toBe('Product Designer')
    expect(p.application_url).toBe('https://jobs.lever.co/acme/abc-123/apply')
    expect(p.external_url).toBe('https://jobs.lever.co/acme/abc-123')
    expect(p.location_raw).toBe('San Francisco')
    expect(p.team).toBe('Design')
    expect(p.department).toBe('Product')
    expect(p.employment_type).toBe('Full-time')
    expect(p.remote_type).toBe('hybrid')
    expect(p.salary_min).toBe(130000)
    expect(p.salary_max).toBe(160000)
    expect(p.salary_currency).toBe('USD')
    expect(p.salary_interval).toBe('year')
    expect(p.posted_at).toBe(new Date(1700000000000).toISOString())
  })

  it('falls back to hostedUrl when applyUrl is absent and tolerates junk', () => {
    const [p] = parseLeverList([{ id: '1', text: 'X', hostedUrl: 'https://jobs.lever.co/acme/1' }], board)
    expect(p.application_url).toBe('https://jobs.lever.co/acme/1')
    expect(parseLeverList(null, board)).toEqual([])
    expect(parseLeverList({ postings: [] }, board)).toEqual([])
  })
})
