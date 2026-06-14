import { describe, expect, it } from 'vitest'
import { sanitizeDashes, sanitizeDashList } from './textSanitizer'

describe('sanitizeDashes', () => {
  it('replaces a spaced em-dash with a comma pause', () => {
    expect(sanitizeDashes('Led delivery — most recently as founder')).toBe(
      'Led delivery, most recently as founder',
    )
  })

  it('replaces a spaced en-dash the same way', () => {
    expect(sanitizeDashes('strong fit – clear impact')).toBe('strong fit, clear impact')
  })

  it('converts a tight em/en dash range to a hyphen', () => {
    expect(sanitizeDashes('2021–Present')).toBe('2021-Present')
    expect(sanitizeDashes('9—5 schedule')).toBe('9-5 schedule')
  })

  it('does not leave a comma stranded before terminal punctuation', () => {
    expect(sanitizeDashes('clean architecture — delivery on time.')).toBe(
      'clean architecture, delivery on time.',
    )
  })

  it('is a no-op for copy that already contains no em/en dashes', () => {
    const clean = 'Salesforce architect with 12+ years of platform delivery.'
    expect(sanitizeDashes(clean)).toBe(clean)
  })

  it('is idempotent', () => {
    const once = sanitizeDashes('discovery to go-live — pragmatic governance')
    expect(sanitizeDashes(once)).toBe(once)
  })

  it('handles empty input', () => {
    expect(sanitizeDashes('')).toBe('')
  })
})

describe('sanitizeDashList', () => {
  it('sanitizes each entry and drops any that become empty', () => {
    expect(sanitizeDashList(['CPQ — Billing', '—', 'Apex & Flows'])).toEqual([
      'CPQ, Billing',
      'Apex & Flows',
    ])
  })
})
