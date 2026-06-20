import { describe, expect, it } from 'vitest'
import { toCanonicalKey } from './canonicalKey.ts'

describe('toCanonicalKey', () => {
  describe('identity + contact mapping', () => {
    it('maps name variants', () => {
      expect(toCanonicalKey('First Name', '')).toBe('first_name')
      expect(toCanonicalKey('', 'firstName')).toBe('first_name')
      expect(toCanonicalKey('Last Name', '')).toBe('last_name')
      expect(toCanonicalKey('Surname', '')).toBe('last_name')
      expect(toCanonicalKey('Full Name', '')).toBe('full_name')
      expect(toCanonicalKey('Name', '')).toBe('full_name')
      expect(toCanonicalKey('Preferred Name', '')).toBe('preferred_name')
    })

    it('maps contact fields', () => {
      expect(toCanonicalKey('Email Address', '')).toBe('email')
      expect(toCanonicalKey('Phone Number', '')).toBe('phone')
      expect(toCanonicalKey('LinkedIn Profile', '')).toBe('linkedin')
      expect(toCanonicalKey('Portfolio URL', '')).toBe('website')
      expect(toCanonicalKey('Current Location', '')).toBe('location')
      expect(toCanonicalKey('State', '')).toBe('state')
    })
  })

  describe('sensitive field mapping', () => {
    it('maps work-auth + sponsorship + clearance', () => {
      expect(toCanonicalKey('Work Authorization', '')).toBe('work_auth')
      expect(toCanonicalKey('Will you require sponsorship?', '')).toBe('requires_sponsorship')
      expect(toCanonicalKey('Security Clearance', '')).toBe('security_clearance')
    })

    it('maps EEO labels', () => {
      expect(toCanonicalKey('Gender', '')).toBe('eeo_gender')
      expect(toCanonicalKey('Race / Ethnicity', '')).toBe('eeo_race')
      expect(toCanonicalKey('Are you Hispanic or Latino?', '')).toBe('eeo_hispanic_latino')
      expect(toCanonicalKey('Veteran Status', '')).toBe('eeo_veteran')
      expect(toCanonicalKey('Disability Status', '')).toBe('eeo_disability')
    })
  })

  describe('document fields', () => {
    it('maps resume + cover letter', () => {
      expect(toCanonicalKey('Resume/CV', '')).toBe('resume')
      expect(toCanonicalKey('Cover Letter', '')).toBe('cover_letter')
    })
  })

  describe('name preferred over label', () => {
    it('uses the machine name when it canonicalizes', () => {
      // label is a custom phrasing, but name is the canonical token.
      expect(toCanonicalKey('Your work e-mail', 'email')).toBe('email')
    })
  })

  describe('unknown custom questions', () => {
    it('slugifies an unknown question to answer:<slug>', () => {
      expect(toCanonicalKey('Why do you want to work here?', '')).toBe('answer:why_do_you_want_to_work_here')
      expect(toCanonicalKey('', 'how_did_you_hear')).toBe('answer:how_did_you_hear')
    })

    it('prefers the human label slug (the stable answer identity) over the name', () => {
      expect(toCanonicalKey('A custom question', 'custom_q_1')).toBe('answer:a_custom_question')
    })

    it('falls back to the name slug when there is no label', () => {
      expect(toCanonicalKey('', 'custom_q_1')).toBe('answer:custom_q_1')
    })

    it('returns null only when both inputs are empty', () => {
      expect(toCanonicalKey('', '')).toBeNull()
      expect(toCanonicalKey('   ', '  ')).toBeNull()
    })
  })
})
