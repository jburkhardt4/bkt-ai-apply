import { describe, expect, it } from 'vitest'
import { decidePrep } from './gating.ts'
import type { MappedField } from './types.ts'

/** Builds a non-sensitive mapped field. */
function plain(key: string): MappedField {
  return {
    fieldKey: key,
    fieldLabel: key,
    fieldType: 'text',
    mappedValue: 'x',
    valueSource: 'profile',
    confidence: 1,
    isSensitive: false,
    reviewGate: false,
    freeTextDraft: null,
    redactionSafe: true,
  }
}

/** Builds a sensitive mapped field. */
function sensitive(key: string): MappedField {
  return { ...plain(key), isSensitive: true, reviewGate: true, redactionSafe: false }
}

describe('decidePrep — auto mode', () => {
  it('prepares a clean low-tier high-score posting', () => {
    expect(
      decidePrep({
        atsFamily: 'greenhouse',
        antibotTier: 'low',
        mode: 'auto',
        matchScore: 90,
        fields: [plain('email'), plain('first_name')],
        preparedBy: 'cron',
      }),
    ).toEqual({ status: 'prepared', gatingReason: null })
  })

  it('blocks workday under auto mode (defended platform)', () => {
    expect(
      decidePrep({
        atsFamily: 'workday',
        antibotTier: 'high',
        mode: 'auto',
        matchScore: 95,
        fields: [plain('email')],
        preparedBy: 'cron',
      }),
    ).toEqual({ status: 'blocked', gatingReason: 'auto_mode_defended_platform' })
  })

  it('blocks an "other" family under auto mode', () => {
    const d = decidePrep({
      atsFamily: 'other',
      antibotTier: 'unknown',
      mode: 'auto',
      matchScore: 95,
      fields: [plain('email')],
      preparedBy: 'cron',
    })
    expect(d.status).toBe('blocked')
  })

  it('needs review when a sensitive field is present (even high score)', () => {
    expect(
      decidePrep({
        atsFamily: 'lever',
        antibotTier: 'low',
        mode: 'auto',
        matchScore: 99,
        fields: [plain('email'), sensitive('work_auth')],
        preparedBy: 'cron',
      }),
    ).toEqual({ status: 'needs_review', gatingReason: 'sensitive_fields_present' })
  })

  it('needs review when match_score is below the auto floor', () => {
    expect(
      decidePrep({
        atsFamily: 'ashby',
        antibotTier: 'low',
        mode: 'auto',
        matchScore: 74,
        fields: [plain('email')],
        preparedBy: 'cron',
      }),
    ).toEqual({ status: 'needs_review', gatingReason: 'match_score_below_auto_floor' })
  })

  it('needs review when match_score is unknown (null)', () => {
    const d = decidePrep({
      atsFamily: 'greenhouse',
      antibotTier: 'low',
      mode: 'auto',
      matchScore: null,
      fields: [plain('email')],
      preparedBy: 'cron',
    })
    expect(d).toEqual({ status: 'needs_review', gatingReason: 'match_score_below_auto_floor' })
  })

  it('prepares exactly at the floor (75)', () => {
    const d = decidePrep({
      atsFamily: 'smartrecruiters',
      antibotTier: 'low',
      mode: 'auto',
      matchScore: 75,
      fields: [plain('email')],
      preparedBy: 'cron',
    })
    expect(d.status).toBe('prepared')
  })

  it('precedence: sensitive field wins over a low score', () => {
    const d = decidePrep({
      atsFamily: 'greenhouse',
      antibotTier: 'low',
      mode: 'auto',
      matchScore: 10,
      fields: [sensitive('eeo_gender')],
      preparedBy: 'cron',
    })
    expect(d.gatingReason).toBe('sensitive_fields_present')
  })
})

describe('decidePrep — on-demand mode', () => {
  it('bypasses the score gate on a low-tier family', () => {
    const d = decidePrep({
      atsFamily: 'greenhouse',
      antibotTier: 'low',
      mode: 'auto',
      matchScore: 10, // below floor, but user-initiated
      fields: [plain('email')],
      preparedBy: 'on_demand',
    })
    expect(d).toEqual({ status: 'prepared', gatingReason: null })
  })

  it('still review-gates a sensitive field on-demand', () => {
    const d = decidePrep({
      atsFamily: 'lever',
      antibotTier: 'low',
      mode: 'hybrid',
      matchScore: null,
      fields: [sensitive('requires_sponsorship')],
      preparedBy: 'on_demand',
    })
    expect(d).toEqual({ status: 'needs_review', gatingReason: 'sensitive_fields_present' })
  })

  it('needs review on-demand for an unreadable family (no auto-read schema)', () => {
    const d = decidePrep({
      atsFamily: 'workday',
      antibotTier: 'high',
      mode: 'hybrid',
      matchScore: 90,
      fields: [plain('email')],
      preparedBy: 'on_demand',
    })
    expect(d).toEqual({ status: 'needs_review', gatingReason: 'unreadable_ats_family' })
  })

  it('is never blocked on-demand (hybrid mode, defended family → review not block)', () => {
    const d = decidePrep({
      atsFamily: 'other',
      antibotTier: 'unknown',
      mode: 'hybrid',
      matchScore: 90,
      fields: [plain('email')],
      preparedBy: 'on_demand',
    })
    expect(d.status).not.toBe('blocked')
    expect(d.status).toBe('needs_review')
  })
})
