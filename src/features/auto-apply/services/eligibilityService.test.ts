import { describe, expect, it } from 'vitest'
import {
  assessEligibility,
  deriveEligibilityProfile,
  effectiveScore,
  GEO_MISMATCH_PENALTY,
  type EligibilityProfile,
} from './eligibilityService'

const US_JB: EligibilityProfile = { usAuthorized: true, location: 'los angeles, ca' }
const NON_US: EligibilityProfile = { usAuthorized: false, location: 'são paulo, brazil' }

describe('assessEligibility', () => {
  it('BLOCKS a posting that explicitly excludes US-based candidates (Swans)', () => {
    const job = {
      title: 'Salesforce Consultant',
      location: 'Remote',
      description:
        'Where are you based? (City, Country) Please note we are currently not considering candidates residing in the US.',
    }
    const res = assessEligibility(job, US_JB)
    expect(res.severity).toBe('block')
    expect(effectiveScore(82, res)).toBe(0)
  })

  it('PENALIZES a foreign-located role with no US-remote option (Plative — India)', () => {
    const job = { title: 'Salesforce Consultant', location: 'India', description: 'At Plative…' }
    const res = assessEligibility(job, US_JB)
    expect(res.severity).toBe('penalize')
    expect(res.penalty).toBe(GEO_MISMATCH_PENALTY)
    // A high skill match drops below the 60 ready-queue floor.
    expect(effectiveScore(78, res)).toBeLessThan(60)
  })

  it('PASSES a Remote (US) role (G2)', () => {
    const job = { title: 'Senior Salesforce Engineer', location: 'Remote (US)', description: 'G2 GTM Systems…', remoteType: 'remote' }
    expect(assessEligibility(job, US_JB).severity).toBe('ok')
  })

  it('PASSES a US role even when a foreign country is also listed (US; Brazil)', () => {
    const job = { title: 'Salesforce Technical Consultant', location: 'United States; Brazil', description: 'Remote' }
    expect(assessEligibility(job, US_JB).severity).toBe('ok')
  })

  it('PASSES a foreign role whose body offers US-remote', () => {
    const job = { title: 'Engineer', location: 'India', description: 'Open to remote candidates anywhere in the US.' }
    expect(assessEligibility(job, US_JB).severity).toBe('ok')
  })

  it('never penalizes a non-US candidate for a foreign role', () => {
    const job = { title: 'Engineer', location: 'India', description: '' }
    expect(assessEligibility(job, NON_US).severity).toBe('ok')
  })

  it('leaves a normal US-eligible role untouched', () => {
    const job = { title: 'RevOps Manager', location: 'Remote, United States', description: 'Own the GTM stack.' }
    const res = assessEligibility(job, US_JB)
    expect(res.severity).toBe('ok')
    expect(effectiveScore(72, res)).toBe(72)
  })
})

describe('deriveEligibilityProfile', () => {
  it('marks a US Citizen as US-authorized', () => {
    expect(deriveEligibilityProfile({ location: 'Los Angeles, CA', work_authorization: 'US Citizen' }).usAuthorized).toBe(true)
  })

  it('marks a green-card holder as US-authorized', () => {
    expect(deriveEligibilityProfile({ location: '', work_authorization: 'Permanent Resident (Green Card)' }).usAuthorized).toBe(true)
  })

  it('infers US from a "City, ST" location even without explicit work auth', () => {
    expect(deriveEligibilityProfile({ location: 'Austin, TX', work_authorization: '' }).usAuthorized).toBe(true)
  })

  it('defaults an empty/unknown profile to NOT US-authorized (never over-gates)', () => {
    expect(deriveEligibilityProfile({ location: '', work_authorization: '' }).usAuthorized).toBe(false)
    expect(deriveEligibilityProfile(null).usAuthorized).toBe(false)
  })
})
