import { describe, it, expect } from 'vitest'
import { scoreJobFit } from './pipelineService'
import type { CandidateProfile, ParsedJobDescription } from '../../../types/pipeline'

// Match-score rubric (100 pts): Skills 35, Domain 20, Seniority 20, Tools 15,
// Location/Auth 10.
//
// The first four buckets use Expected-Target scoring:
//   Math.min(Math.round((matched / expectedTarget) * weight), weight)
// where expectedTarget is a fixed constant (skills=3, domain=1, seniority=2,
// tools=2), NOT the length of the master-profile keyword list.
// Matching at or above the target awards the full bucket weight; exceeding it
// is capped at the weight (Math.min). Below-target results are proportional.
//
// Targets were recalibrated 2026-06 (skills 4→3, domain 2→1) to un-starve the
// funnel; the Location/Auth baseline was raised 2→5 and the match list widened
// to remote/hybrid/anywhere/US/target-metro.
//
// Canonical bucket values:
//   Skills  (target 3, weight 35): 0→0, 1→12, 2→23, 3→35, 4+→35 (capped)
//   Domain  (target 1, weight 20): 0→0, 1→20, 2+→20
//   Seniority (target 2, weight 20): 0→0, 1→10, 2→20, 3+→20
//   Tools   (target 2, weight 15): 0→0, 1→8,  2→15, 3+→15
//   Location/Auth: 10 (remote/hybrid/anywhere/US/target match), 5 (baseline)

function buildProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    fullName: 'Test Candidate',
    targetLocation: 'Austin, TX',
    seniorityKeywords: ['principal'],
    skillKeywords: [
      'react',
      'typescript',
      'node',
      'graphql',
      'postgres',
      'aws',
      'docker',
      'redis',
      'kafka',
      'python',
    ],
    domainKeywords: ['fintech', 'payments'],
    toolingKeywords: ['jira', 'confluence'],
    quantifiedOutcomes: [],
    constraints: { requireHumanApprovalForSubmit: true, autoApplyThreshold: 60 },
    ...overrides,
  }
}

function buildParsed(overrides: Partial<ParsedJobDescription> = {}): ParsedJobDescription {
  return {
    title: 'Software Engineer',
    company: 'Acme',
    location: 'New York',
    requirements: [],
    authorizationNotes: [],
    ...overrides,
  }
}

describe('scoreJobFit — Expected-Target scoring', () => {
  // -------------------------------------------------------------------------
  // (a) Below-target proportional cases
  // -------------------------------------------------------------------------

  it('Skills below target: 1 of 3 expected → round(1/3 * 35) = 12', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Experience with react', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown.skills).toBe(12)
    expect(result.breakdown.domain).toBe(0)
    expect(result.breakdown.seniority).toBe(0)
    expect(result.breakdown.tools).toBe(0)
    expect(result.breakdown.locationAuth).toBe(5)
    expect(result.overall).toBe(17)
  })

  it('Skills below target: 2 of 3 expected → round(2/3 * 35) = 23', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Must know react and typescript', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown.skills).toBe(23)
  })

  it('Domain at target: 1 of 1 expected → full weight 20', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Background in fintech preferred', bucket: 'nice_to_have', matchedKeywords: [] },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown.domain).toBe(20)
  })

  it('Tools below target: 1 of 2 expected → round(1/2 * 15) = 8', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Experience using jira for project management', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown.tools).toBe(8)
  })

  // -------------------------------------------------------------------------
  // (b) At-target = full-weight cases
  // -------------------------------------------------------------------------

  it('Skills at/above target: 4 matches vs target 3 → full weight 35', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'React, typescript, node, and graphql experience required', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.skills).toBe(35)
  })

  it('Domain above target: 2 matches vs target 1 → full weight 20', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Fintech and payments domain knowledge required', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.domain).toBe(20)
  })

  it('Tools at target: 2 of 2 expected → full weight 15', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        { text: 'Proficiency with jira and confluence', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.tools).toBe(15)
  })

  // -------------------------------------------------------------------------
  // (c) Over-target cases — Math.min cap ensures bucket cannot exceed weight
  // -------------------------------------------------------------------------

  it('Skills over target: 5 matches against target 3 → still capped at 35', () => {
    const profile = buildProfile()
    const parsed = buildParsed({
      requirements: [
        {
          text: 'Deep expertise in react, typescript, node, graphql, and postgres',
          bucket: 'must_have',
          matchedKeywords: [],
        },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.skills).toBe(35)
  })

  it('Domain over target: 3+ matches → capped at 20', () => {
    // Profile has 2 domain keywords; inject a JD that also contains a word
    // matching a second domain keyword to go above the target of 2.
    // Use a profile with 3 domain keywords so matching all 3 exceeds target=2.
    const profile = buildProfile({
      domainKeywords: ['fintech', 'payments', 'banking'],
    })
    const parsed = buildParsed({
      requirements: [
        {
          text: 'Experience in fintech, payments, and banking sectors',
          bucket: 'must_have',
          matchedKeywords: [],
        },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.domain).toBe(20)
  })

  it('Tools over target: 3 matches against target 2 → capped at 15', () => {
    const profile = buildProfile({
      toolingKeywords: ['jira', 'confluence', 'notion'],
    })
    const parsed = buildParsed({
      requirements: [
        {
          text: 'Must use jira, confluence, and notion daily',
          bucket: 'must_have',
          matchedKeywords: [],
        },
      ],
    })

    expect(scoreJobFit(parsed, profile).breakdown.tools).toBe(15)
  })

  // -------------------------------------------------------------------------
  // Location / Auth — unchanged behavior
  // -------------------------------------------------------------------------

  it('awards full Location/Auth (10) when the JD mentions remote', () => {
    const parsed = buildParsed({
      requirements: [{ text: 'This is a fully remote position', bucket: 'must_have', matchedKeywords: [] }],
    })

    expect(scoreJobFit(parsed, buildProfile()).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD matches the target location', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Austin, TX (in office)' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions hybrid', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Hybrid, Austin TX' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions anywhere', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Work from anywhere in the US' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions United States', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'United States (any state)' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions US (abbreviation)', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Based in the US' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions USA', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Anywhere in USA' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD mentions U.S.', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Open to candidates in the U.S.' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('awards full Location/Auth (10) when the JD says US-based', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ title: 'US-based Software Engineer' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(10)
  })

  it('falls back to the baseline Location/Auth (5) when neither remote nor target location match', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'New York, NY' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(5)
  })

  it('does not false-positive on lowercase "us" pronoun (e.g. "contact us")', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'Reach out to us at Berlin, Germany' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(5)
  })

  // -------------------------------------------------------------------------
  // Guard: expectedTarget <= 0 returns 0 (no divide-by-zero)
  // -------------------------------------------------------------------------

  it('returns 0 for a keyword bucket with no profile keywords (expectedTarget guard)', () => {
    const profile = buildProfile({ skillKeywords: [] })

    expect(scoreJobFit(buildParsed(), profile).breakdown.skills).toBe(0)
  })

  // -------------------------------------------------------------------------
  // (d) Perfect 100 — all buckets at/above target + remote
  // -------------------------------------------------------------------------

  it('sums all five buckets to a perfect 100 when every category meets/exceeds target and the role is remote', () => {
    // Profile keywords: at least one per bucket category that will appear in
    // the JD, ensuring matched >= expectedTarget for each bucket.
    const profile = buildProfile({
      skillKeywords: ['salesforce', 'mulesoft', 'apex', 'lightning'],
      domainKeywords: ['insurance', 'reinsurance'],
      seniorityKeywords: ['director', 'vp'],
      toolingKeywords: ['tableau', 'powerbi'],
    })
    const parsed = buildParsed({
      title: 'Director of Salesforce',
      requirements: [
        {
          text: 'Remote role. VP or Director level. Insurance and reinsurance industry experience.',
          bucket: 'must_have',
          matchedKeywords: [],
        },
        {
          text: 'Salesforce, mulesoft, apex, and lightning required. Tableau and powerbi a plus.',
          bucket: 'must_have',
          matchedKeywords: [],
        },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown).toEqual({
      skills: 35,
      domain: 20,
      seniority: 20,
      tools: 15,
      locationAuth: 10,
    })
    expect(result.overall).toBe(100)
  })
})
