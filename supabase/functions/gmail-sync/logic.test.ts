import { describe, expect, it } from 'vitest'
import {
  classifyByKeywords,
  canTransitionStage,
  isExcludedSender,
  matchApplication,
  parseGeminiClassification,
  resolveAutoAction,
  resolveLabelClassification,
  senderDomain,
  shouldStoreEmail,
  GMAIL_LABEL_CONFIDENCE,
  type ApplicationCandidate,
  type EmailFacts,
  type LabelMapEntry,
} from './logic.ts'

const facts = (overrides: Partial<EmailFacts> = {}): EmailFacts => ({
  fromAddress: 'recruiter@acme.com',
  subject: 'Hello',
  snippet: null,
  ...overrides,
})

const candidate = (overrides: Partial<ApplicationCandidate> = {}): ApplicationCandidate => ({
  applicationId: 'app-1',
  stage: 'applied',
  companyName: 'Acme',
  companyDomain: 'acme.com',
  jobTitle: 'Salesforce Architect',
  ...overrides,
})

describe('classifyByKeywords', () => {
  it('classifies an offer email with boosted confidence per match', () => {
    const result = classifyByKeywords(
      facts({ subject: 'Offer letter', snippet: 'We are pleased to offer you — congratulations!' }),
    )
    expect(result.classification).toBe('offer')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.source).toBe('keywords')
  })

  it('returns unknown at 0.5 when nothing matches', () => {
    const result = classifyByKeywords(
      facts({ fromAddress: 'no-reply@newsletter.io', subject: 'Weekly digest', snippet: 'Top stories' }),
    )
    expect(result.classification).toBe('unknown')
    expect(result.confidence).toBe(0.5)
  })
})

describe('parseGeminiClassification', () => {
  it('parses a clean JSON reply', () => {
    const result = parseGeminiClassification('{"classification":"rejection","confidence":0.91}')
    expect(result).toEqual({ classification: 'rejection', confidence: 0.91, source: 'gemini' })
  })

  it('extracts JSON embedded in prose and clamps confidence', () => {
    const result = parseGeminiClassification(
      'Sure! Here is the result: {"classification":"offer","confidence":1.7} Hope that helps.',
    )
    expect(result?.classification).toBe('offer')
    expect(result?.confidence).toBe(1)
  })

  it('rejects unknown classes and malformed payloads', () => {
    expect(parseGeminiClassification('{"classification":"spam","confidence":0.9}')).toBeNull()
    expect(parseGeminiClassification('{"classification":"offer"}')).toBeNull()
    expect(parseGeminiClassification('not json at all')).toBeNull()
  })
})

describe('senderDomain', () => {
  it('handles display-name headers and normalizes www', () => {
    expect(senderDomain('Jane Doe <jane@WWW.Acme.com>')).toBe('acme.com')
    expect(senderDomain('plain@acme.com')).toBe('acme.com')
    expect(senderDomain('not-an-address')).toBeNull()
  })
})

describe('isExcludedSender', () => {
  const self = 'john@bktadvisory.com'

  it('excludes self-sent mail (the Gemini daily-summary digest)', () => {
    expect(isExcludedSender('John Burkhardt <john@bktadvisory.com>', self)).toBe(true)
    expect(isExcludedSender('JOHN@BKTADVISORY.COM', self)).toBe(true)
  })

  it('excludes known digest/no-reply senders from the blocklist', () => {
    expect(isExcludedSender('Gemini <gemini-noreply@google.com>', self)).toBe(true)
  })

  it('keeps genuine recruiter/employer mail', () => {
    expect(isExcludedSender('recruiter@acme.com', self)).toBe(false)
    expect(isExcludedSender('careers@google.com', self)).toBe(false) // not the digest no-reply
  })

  it('does not exclude when self email is unknown and sender is not blocklisted', () => {
    expect(isExcludedSender('recruiter@acme.com', null)).toBe(false)
  })
})

describe('matchApplication', () => {
  it('matches on sender domain', () => {
    const match = matchApplication(facts(), [candidate()])
    expect(match?.applicationId).toBe('app-1')
    expect(match?.reason).toContain('sender domain')
  })

  it('breaks domain ties using job-title overlap', () => {
    const match = matchApplication(
      facts({ subject: 'Your Salesforce Architect interview' }),
      [
        candidate({ applicationId: 'app-other', jobTitle: 'Data Engineer' }),
        candidate({ applicationId: 'app-arch' }),
      ],
    )
    expect(match?.applicationId).toBe('app-arch')
  })

  it('falls back to company-name + title overlap when domains differ', () => {
    const match = matchApplication(
      facts({
        fromAddress: 'no-reply@greenhouse.io',
        subject: 'Acme — Salesforce Architect application update',
      }),
      [candidate()],
    )
    expect(match?.applicationId).toBe('app-1')
    expect(match?.reason).toContain('company name')
  })

  it('does not match on company name alone (ATS senders are ambiguous)', () => {
    const match = matchApplication(
      facts({ fromAddress: 'no-reply@greenhouse.io', subject: 'Acme update' }),
      [candidate()],
    )
    expect(match).toBeNull()
  })
})

describe('shouldStoreEmail', () => {
  it('drops unknown unmatched mail, keeps unknown mail from a known company', () => {
    const unknown = { classification: 'unknown', confidence: 0.5, source: 'keywords' } as const
    expect(shouldStoreEmail(unknown, null)).toBe(false)
    expect(
      shouldStoreEmail(unknown, { applicationId: 'app-1', stage: 'applied', reason: 'domain' }),
    ).toBe(true)
  })

  it('keeps every classified email', () => {
    const classified = { classification: 'rejection', confidence: 0.4, source: 'gemini' } as const
    expect(shouldStoreEmail(classified, null)).toBe(true)
  })

  it('keeps unknown unmatched mail when JB labeled it in Gmail (BR-035)', () => {
    const unknown = { classification: 'unknown', confidence: 0.95, source: 'gmail_label' } as const
    expect(shouldStoreEmail(unknown, null, true)).toBe(true)
  })
})

describe('resolveLabelClassification (BR-037)', () => {
  const map: LabelMapEntry[] = [
    { gmailLabel: 'Interview Invite', classification: 'interview_invite', displayLabel: 'interview-inv' },
    { gmailLabel: 'Rejected', classification: 'rejection', displayLabel: 'rejected' },
    { gmailLabel: 'OTP', classification: 'unknown', displayLabel: 'otp' },
  ]

  it('matches case-insensitively and carries the display label', () => {
    const result = resolveLabelClassification(['INBOX', 'interview invite'], map)
    expect(result?.decision).toEqual({
      classification: 'interview_invite',
      confidence: GMAIL_LABEL_CONFIDENCE,
      source: 'gmail_label',
    })
    expect(result?.displayLabel).toBe('interview-inv')
  })

  it('prefers the most consequential classification when several labels match', () => {
    const result = resolveLabelClassification(['Interview Invite', 'Rejected'], map)
    expect(result?.decision.classification).toBe('rejection')
  })

  it('returns null when no label is mapped', () => {
    expect(resolveLabelClassification(['INBOX', 'Newsletters'], map)).toBeNull()
    expect(resolveLabelClassification([], map)).toBeNull()
    expect(resolveLabelClassification(['Rejected'], [])).toBeNull()
  })
})

describe('resolveAutoAction', () => {
  const matched = { applicationId: 'app-1', stage: 'applied', reason: 'domain' } as const

  it('skips below the 0.70 threshold (BR-030)', () => {
    const plan = resolveAutoAction(
      { classification: 'rejection', confidence: 0.69, source: 'gemini' },
      { ...matched },
    )
    expect(plan).toEqual({ action: 'skip', reason: expect.stringContaining('below 0.70') })
  })

  it('skips when no application matched', () => {
    const plan = resolveAutoAction(
      { classification: 'rejection', confidence: 0.95, source: 'gemini' },
      null,
    )
    expect(plan.action).toBe('skip')
  })

  it('applies offer-stage protection against rejections', () => {
    const plan = resolveAutoAction(
      { classification: 'rejection', confidence: 0.95, source: 'gemini' },
      { ...matched, stage: 'offer' },
    )
    expect(plan).toEqual({ action: 'skip', reason: expect.stringContaining('Offer-stage protection') })
  })

  it('transitions an applied application on a high-confidence interview invite (BR-031)', () => {
    const plan = resolveAutoAction(
      { classification: 'interview_invite', confidence: 0.85, source: 'gemini' },
      { ...matched },
    )
    expect(plan).toEqual({ action: 'skip', reason: expect.stringContaining('not allowed') })
    // applied → interview_scheduled requires screening in between; rejection is allowed:
    const rejection = resolveAutoAction(
      { classification: 'rejection', confidence: 0.85, source: 'gemini' },
      { ...matched },
    )
    expect(rejection).toEqual({ action: 'transition', toStage: 'rejected' })
  })

  it('transitions screening → interview_scheduled', () => {
    const plan = resolveAutoAction(
      { classification: 'interview_invite', confidence: 0.85, source: 'gemini' },
      { ...matched, stage: 'screening' },
    )
    expect(plan).toEqual({ action: 'transition', toStage: 'interview_scheduled' })
  })
})

describe('canTransitionStage (ported table)', () => {
  it('mirrors stageRules.ts semantics', () => {
    expect(canTransitionStage('ghosted', 'applied')).toBe(true)
    expect(canTransitionStage('hired', 'rejected')).toBe(false)
    expect(canTransitionStage('offer', 'hired')).toBe(true)
  })
})
