import { describe, expect, it } from 'vitest'
import { buildListEndpoint, LEVER_PAGE_LIMIT, nextCursor } from './listEndpoint.ts'
import type { BoardRef } from './types.ts'

const board = (over: Partial<BoardRef>): BoardRef => ({
  id: 'b1', ats_family: 'greenhouse', board_token: 'acme', ...over,
})

describe('buildListEndpoint', () => {
  it('builds the Greenhouse board list URL', () => {
    const req = buildListEndpoint(board({ ats_family: 'greenhouse', board_token: 'acme' }))
    expect(req).toEqual({
      url: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
      method: 'GET',
      headers: {},
    })
  })

  it('builds the Lever URL with skip/limit pagination', () => {
    expect(buildListEndpoint(board({ ats_family: 'lever', board_token: 'acme' }))!.url)
      .toBe(`https://api.lever.co/v0/postings/acme?mode=json&limit=${LEVER_PAGE_LIMIT}&skip=0`)
    expect(buildListEndpoint(board({ ats_family: 'lever', board_token: 'acme' }), { offset: 100 })!.url)
      .toBe(`https://api.lever.co/v0/postings/acme?mode=json&limit=${LEVER_PAGE_LIMIT}&skip=100`)
  })

  it('builds the Ashby posting-api URL', () => {
    expect(buildListEndpoint(board({ ats_family: 'ashby', board_token: 'acme' }))!.url)
      .toBe('https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true')
  })

  it('attaches an If-None-Match header when an etag is known', () => {
    const req = buildListEndpoint(board({ last_etag: 'W/"abc"' }))
    expect(req!.headers).toEqual({ 'If-None-Match': 'W/"abc"' })
  })

  it('URL-encodes the board token', () => {
    expect(buildListEndpoint(board({ ats_family: 'greenhouse', board_token: 'a/c me' }))!.url)
      .toContain('/boards/a%2Fc%20me/jobs')
  })

  it('returns null for non-v1 families', () => {
    expect(buildListEndpoint(board({ ats_family: 'workday' }))).toBeNull()
    expect(buildListEndpoint(board({ ats_family: 'other' }))).toBeNull()
  })
})

describe('nextCursor', () => {
  it('advances Lever pagination on a full page only', () => {
    expect(nextCursor('lever', new Array(LEVER_PAGE_LIMIT).fill({}), { offset: 0 })).toEqual({ offset: 100 })
    expect(nextCursor('lever', new Array(LEVER_PAGE_LIMIT).fill({}), { offset: 100 })).toEqual({ offset: 200 })
    expect(nextCursor('lever', new Array(40).fill({}), { offset: 0 })).toBeNull()
  })
  it('never paginates single-page families', () => {
    expect(nextCursor('greenhouse', { jobs: [] })).toBeNull()
    expect(nextCursor('ashby', { jobs: [] })).toBeNull()
  })
})
