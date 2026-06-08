import { describe, it, expect } from 'vitest'
import { scoreJobFit } from './pipelineService'
import type { CandidateProfile, ParsedJobDescription } from '../../../types/pipeline'

// Match-score rubric (100 pts): Skills 35, Domain 20, Seniority 20, Tools 15,
// Location/Auth 10. The first four buckets are proportional —
// round((matched / totalProfileKeywords) * weight). Location/Auth is boolean:
// 10 if the JD mentions "remote" OR matches targetLocation, else a baseline 2.
//
// Keyword sets below are deliberately isolated per bucket so each can be
// exercised without accidental cross-bucket substring matches.

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
    domainKeywords: ['fintech'],
    toolingKeywords: ['jira'],
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

describe('scoreJobFit', () => {
  it('scores Skills proportionally — 7 of 10 keywords → round(0.7 * 35) = 25', () => {
    const profile = buildProfile()
    // Exactly 7 of the 10 skillKeywords appear; redis / kafka / python are absent.
    const parsed = buildParsed({
      requirements: [
        { text: 'Experience with react, typescript, and node', bucket: 'must_have', matchedKeywords: [] },
        { text: 'Familiarity with graphql, postgres, aws, and docker', bucket: 'must_have', matchedKeywords: [] },
      ],
    })

    const result = scoreJobFit(parsed, profile)

    expect(result.breakdown.skills).toBe(25)
    // Other keyword buckets have no matches; location does not match → baseline 2.
    expect(result.breakdown.domain).toBe(0)
    expect(result.breakdown.seniority).toBe(0)
    expect(result.breakdown.tools).toBe(0)
    expect(result.breakdown.locationAuth).toBe(2)
    expect(result.overall).toBe(27)
  })

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

  it('falls back to the baseline Location/Auth (2) when neither remote nor target location match', () => {
    const profile = buildProfile({ targetLocation: 'Austin, TX' })
    const parsed = buildParsed({ location: 'New York, NY' })

    expect(scoreJobFit(parsed, profile).breakdown.locationAuth).toBe(2)
  })

  it('returns 0 for a keyword bucket with no profile keywords (no divide-by-zero)', () => {
    const profile = buildProfile({ skillKeywords: [] })

    expect(scoreJobFit(buildParsed(), profile).breakdown.skills).toBe(0)
  })

  it('sums all five buckets to a perfect 100 when every category matches and the role is remote', () => {
    const profile = buildProfile({
      skillKeywords: ['salesforce'],
      domainKeywords: ['insurance'],
      seniorityKeywords: ['director'],
      toolingKeywords: ['tableau'],
    })
    const parsed = buildParsed({
      title: 'Director of Salesforce',
      requirements: [
        { text: 'Remote role in the insurance industry', bucket: 'must_have', matchedKeywords: [] },
        { text: 'Tableau reporting experience required', bucket: 'must_have', matchedKeywords: [] },
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
