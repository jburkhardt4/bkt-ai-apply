import { describe, expect, it } from 'vitest'
import { isSensitiveField } from './sensitivity.ts'

describe('isSensitiveField', () => {
  describe('sensitive by canonical key', () => {
    it('flags work-auth, sponsorship, clearance', () => {
      expect(isSensitiveField('work_auth', 'Work Authorization')).toBe(true)
      expect(isSensitiveField('requires_sponsorship', 'Sponsorship')).toBe(true)
      expect(isSensitiveField('security_clearance', 'Clearance')).toBe(true)
    })

    it('flags every EEO key (explicit + eeo_ prefix)', () => {
      expect(isSensitiveField('eeo_gender', 'Gender')).toBe(true)
      expect(isSensitiveField('eeo_race', 'Race')).toBe(true)
      expect(isSensitiveField('eeo_hispanic_latino', 'Hispanic')).toBe(true)
      expect(isSensitiveField('eeo_veteran', 'Veteran')).toBe(true)
      expect(isSensitiveField('eeo_disability', 'Disability')).toBe(true)
      expect(isSensitiveField('eeo_future_field', 'Anything')).toBe(true)
    })
  })

  describe('sensitive by label scan (custom screeners)', () => {
    it('flags salary/compensation phrasing on a custom answer key', () => {
      expect(isSensitiveField('answer:expected_comp', 'What is your expected salary?')).toBe(true)
      expect(isSensitiveField('answer:comp', 'Desired compensation range')).toBe(true)
    })

    it('flags sponsorship/visa phrasing on a custom answer key', () => {
      expect(isSensitiveField('answer:visa', 'Do you now or in the future require visa sponsorship?')).toBe(true)
    })

    it('flags legal attestations', () => {
      expect(isSensitiveField('answer:certify', 'I certify the above is accurate')).toBe(true)
      expect(isSensitiveField('answer:bg', 'Do you consent to a background check?')).toBe(true)
    })

    it('flags demographic prompts even on a generic key', () => {
      expect(isSensitiveField('answer:x', 'What is your gender identity?')).toBe(true)
    })
  })

  describe('non-sensitive fields', () => {
    it('does not flag ordinary contact / identity fields', () => {
      expect(isSensitiveField('email', 'Email Address')).toBe(false)
      expect(isSensitiveField('first_name', 'First Name')).toBe(false)
      expect(isSensitiveField('linkedin', 'LinkedIn Profile')).toBe(false)
      expect(isSensitiveField('location', 'Current Location')).toBe(false)
    })

    it('does not flag a benign custom question', () => {
      expect(isSensitiveField('answer:why_us', 'Why do you want to work here?')).toBe(false)
      expect(isSensitiveField('answer:start', 'When can you start?')).toBe(false)
    })
  })
})
