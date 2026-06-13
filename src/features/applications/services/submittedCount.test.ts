import { describe, expect, it } from 'vitest'
import { deriveSubmittedCount, isSubmittedApplication } from './submittedCount'

describe('isSubmittedApplication', () => {
  it('counts discovery as NOT submitted when there is no submitted_at', () => {
    expect(isSubmittedApplication({ stage: 'discovery', submitted_at: null })).toBe(false)
  })

  it('counts each post-discovery happy-path stage as submitted', () => {
    for (const stage of [
      'applied',
      'screening',
      'interview_scheduled',
      'interview_complete',
      'offer',
      'hired',
    ]) {
      expect(isSubmittedApplication({ stage, submitted_at: null })).toBe(true)
    }
  })

  it('counts rejected/ghosted as submitted when submitted_at is set', () => {
    expect(isSubmittedApplication({ stage: 'rejected', submitted_at: '2026-06-01T00:00:00Z' })).toBe(true)
    expect(isSubmittedApplication({ stage: 'ghosted', submitted_at: '2026-06-01T00:00:00Z' })).toBe(true)
  })

  it('counts rejected/ghosted as submitted when the event log proves a submission', () => {
    const everSubmitted = new Set(['a1', 'a2'])
    expect(isSubmittedApplication({ id: 'a1', stage: 'rejected', submitted_at: null }, everSubmitted)).toBe(true)
    expect(isSubmittedApplication({ id: 'a2', stage: 'ghosted', submitted_at: null }, everSubmitted)).toBe(true)
  })

  it('does NOT count rejected/ghosted dismissed straight from discovery (no submission event)', () => {
    const everSubmitted = new Set(['a1'])
    // a9 has no submission event and no submitted_at — a discovery dismissal.
    expect(isSubmittedApplication({ id: 'a9', stage: 'rejected', submitted_at: null }, everSubmitted)).toBe(false)
    expect(isSubmittedApplication({ id: 'a9', stage: 'ghosted', submitted_at: null }, everSubmitted)).toBe(false)
    // Without an event set at all, ambiguous terminals stay uncounted.
    expect(isSubmittedApplication({ id: 'a9', stage: 'rejected', submitted_at: null })).toBe(false)
  })

  it('counts a discovery row as submitted when submitted_at is set', () => {
    expect(isSubmittedApplication({ stage: 'discovery', submitted_at: '2026-06-01T00:00:00Z' })).toBe(true)
  })
})

describe('deriveSubmittedCount', () => {
  it('returns 0 for an empty set', () => {
    expect(deriveSubmittedCount([])).toBe(0)
  })

  it('counts only submitted applications across a mixed set', () => {
    const rows = [
      { id: 'd1', stage: 'discovery', submitted_at: null }, // not submitted
      { id: 'a1', stage: 'applied', submitted_at: null }, // submitted (stage)
      { id: 's1', stage: 'screening', submitted_at: null }, // submitted (stage)
      { id: 'r1', stage: 'rejected', submitted_at: null }, // ambiguous → resolved below
      { id: 'r2', stage: 'rejected', submitted_at: '2026-06-01T00:00:00Z' }, // submitted (stamp)
      { id: 'h1', stage: 'hired', submitted_at: '2026-06-02T00:00:00Z' }, // submitted
    ]
    // Without event resolution, the bare rejected row (r1) does not count → 4.
    expect(deriveSubmittedCount(rows)).toBe(4)
    // With r1 proven submitted via the event log → 5.
    expect(deriveSubmittedCount(rows, new Set(['r1']))).toBe(5)
  })
})
