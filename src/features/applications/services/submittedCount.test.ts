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

  it('does NOT count rejected/ghosted reached directly from discovery', () => {
    expect(isSubmittedApplication({ stage: 'rejected', submitted_at: null })).toBe(false)
    expect(isSubmittedApplication({ stage: 'ghosted', submitted_at: null })).toBe(false)
  })

  it('counts rejected/ghosted as submitted when submitted_at is set (was applied first)', () => {
    expect(isSubmittedApplication({ stage: 'rejected', submitted_at: '2026-06-01T00:00:00Z' })).toBe(true)
    expect(isSubmittedApplication({ stage: 'ghosted', submitted_at: '2026-06-01T00:00:00Z' })).toBe(true)
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
      { stage: 'discovery', submitted_at: null }, // not submitted
      { stage: 'applied', submitted_at: null }, // submitted (stage)
      { stage: 'screening', submitted_at: null }, // submitted (stage)
      { stage: 'rejected', submitted_at: null }, // declined from discovery — not submitted
      { stage: 'rejected', submitted_at: '2026-06-01T00:00:00Z' }, // submitted (submitted_at)
      { stage: 'hired', submitted_at: '2026-06-02T00:00:00Z' }, // submitted
    ]
    expect(deriveSubmittedCount(rows)).toBe(4)
  })
})
