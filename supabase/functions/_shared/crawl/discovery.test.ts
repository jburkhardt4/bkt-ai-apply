import { describe, expect, it } from 'vitest'
import { extractBoardRef } from './discovery.ts'

describe('extractBoardRef', () => {
  it('extracts Greenhouse board tokens (both hosts)', () => {
    expect(extractBoardRef('https://boards.greenhouse.io/acme/jobs/123'))
      .toEqual({ ats_family: 'greenhouse', board_token: 'acme' })
    expect(extractBoardRef('https://job-boards.greenhouse.io/acme/jobs/123'))
      .toEqual({ ats_family: 'greenhouse', board_token: 'acme' })
  })

  it('extracts Lever sites', () => {
    expect(extractBoardRef('https://jobs.lever.co/acme/2c1f-uuid'))
      .toEqual({ ats_family: 'lever', board_token: 'acme' })
  })

  it('extracts Ashby orgs from the canonical host and subdomains', () => {
    expect(extractBoardRef('https://jobs.ashbyhq.com/acme/uuid'))
      .toEqual({ ats_family: 'ashby', board_token: 'acme' })
    expect(extractBoardRef('https://acme.ashbyhq.com/role/uuid'))
      .toEqual({ ats_family: 'ashby', board_token: 'acme' })
  })

  it('returns null for non-v1 families and junk', () => {
    expect(extractBoardRef('https://acme.wd1.myworkdayjobs.com/en-US/careers/job/1')).toBeNull()
    expect(extractBoardRef('https://careers.example.com/jobs/1')).toBeNull()
    expect(extractBoardRef('not-a-url')).toBeNull()
  })
})
