import type {
  ApplicationEvent,
  CandidateProfile,
  MatchResult,
  ParsedJobDescription,
  ParsedRequirement,
  TailoredArtifact,
} from '../../../types/pipeline'

const rolePattern = /(senior|lead|manager|director|principal)\s+([a-z\s]+?)(?:\n| at |\(|$)/i
const companyPattern = /(?:at|with)\s+([A-Z][A-Za-z0-9&\-.\s]{2,})/m
const locationPattern = /(remote|hybrid|onsite|on-site|[A-Za-z\s]+,\s?[A-Z]{2})/i

function toWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function extractKeywords(content: string, keywords: string[]): string[] {
  const normalized = content.toLowerCase()
  return keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()))
}

// Expected-target scoring (see scoreJobFit). A bucket reaches full weight at its
// target match count. Calibrated 2026-06 to un-starve the funnel: the previous
// targets (skills 4, domain 2) were too strict against real postings that use
// different phrasing than the master profile, pushing strong-fit roles below the
// 60 consideration line. Skills 4→3 and domain 2→1 raise the pass rate without
// touching the 80 auto-submit threshold (BR-008). See docs/domain/business-rules.md.
const SCORE_TARGETS = {
  skills: 3,
  domain: 1,
  seniority: 2,
  tools: 2,
} as const

function scoreBucket(matched: number, expectedTarget: number, weight: number): number {
  if (expectedTarget <= 0) {
    return 0
  }

  return Math.min(Math.round((matched / expectedTarget) * weight), weight)
}

export function parseJobDescription(rawText: string, profile: CandidateProfile): ParsedJobDescription {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const heading = lines[0] ?? 'Unknown role'
  const roleMatch = rawText.match(rolePattern)
  const companyMatch = rawText.match(companyPattern)
  const locationMatch = rawText.match(locationPattern)

  const title = roleMatch ? roleMatch[0].trim() : heading
  const company = companyMatch ? companyMatch[1].trim() : 'Unknown company'
  const location = locationMatch ? locationMatch[1].trim() : 'Unspecified'

  const requirementLines = lines.filter(
    (line) =>
      /\b(required|requirements|must|experience|preferred|nice to have|bonus)\b/i.test(line) ||
      /^[-*]/.test(line),
  )

  const requirements: ParsedRequirement[] = requirementLines.map((line) => {
    const lower = line.toLowerCase()
    const bucket = /preferred|nice to have|bonus/.test(lower) ? 'nice_to_have' : 'must_have'
    const matchedKeywords = extractKeywords(line, [
      ...profile.skillKeywords,
      ...profile.domainKeywords,
      ...profile.toolingKeywords,
    ])

    return {
      text: line.replace(/^[-*]\s*/, ''),
      bucket,
      matchedKeywords,
    }
  })

  const authorizationNotes = lines.filter((line) =>
    /\b(work authorization|visa|sponsorship|eligible to work|citizen)\b/i.test(line),
  )

  return {
    title,
    company,
    location,
    requirements,
    authorizationNotes,
  }
}

export function scoreJobFit(parsed: ParsedJobDescription, profile: CandidateProfile): MatchResult {
  const combined = [
    parsed.title,
    parsed.company,
    parsed.location,
    ...parsed.requirements.map((item) => item.text),
    ...parsed.authorizationNotes,
  ].join(' ')

  const skillsMatched = extractKeywords(combined, profile.skillKeywords).length
  const domainsMatched = extractKeywords(combined, profile.domainKeywords).length
  const seniorityMatched = extractKeywords(combined, profile.seniorityKeywords).length
  const toolsMatched = extractKeywords(combined, profile.toolingKeywords).length
  // Location/auth: full credit for remote/hybrid/anywhere, the target metro, or
  // a generic US posting. Broadened 2026-06 so US-wide roles outside the target
  // metro are not punished (the funnel skewed against non-metro postings).
  const lowerCombined = combined.toLowerCase()
  const targetMetro = profile.targetLocation.toLowerCase().split(',')[0].trim()
  const locationMatched = Number(
    lowerCombined.includes('remote') ||
      lowerCombined.includes('hybrid') ||
      lowerCombined.includes('anywhere') ||
      lowerCombined.includes('united states') ||
      // Word-boundary match for common US abbreviations written in uppercase so
      // the pronoun "us" in text like "contact us" is not accidentally matched.
      /\b(US|U\.S\.?|USA|US-based)\b/.test(combined) ||
      (targetMetro.length > 0 && lowerCombined.includes(targetMetro)),
  )

  const breakdown = {
    skills: scoreBucket(skillsMatched, SCORE_TARGETS.skills, 35),
    domain: scoreBucket(domainsMatched, SCORE_TARGETS.domain, 20),
    seniority: scoreBucket(seniorityMatched, SCORE_TARGETS.seniority, 20),
    tools: scoreBucket(toolsMatched, SCORE_TARGETS.tools, 15),
    // Baseline raised 2→5: a non-remote, non-target role still has location signal.
    locationAuth: locationMatched > 0 ? 10 : 5,
  }

  const overall = breakdown.skills + breakdown.domain + breakdown.seniority + breakdown.tools + breakdown.locationAuth
  const allGaps = [...profile.skillKeywords, ...profile.domainKeywords, ...profile.toolingKeywords].filter(
    (keyword) => !combined.toLowerCase().includes(keyword),
  )

  const strengths = [
    ...extractKeywords(combined, profile.skillKeywords),
    ...extractKeywords(combined, profile.domainKeywords),
    ...extractKeywords(combined, profile.toolingKeywords),
  ]

  return {
    overall,
    threshold: profile.constraints.autoApplyThreshold,
    thresholdPassed: overall >= profile.constraints.autoApplyThreshold,
    breakdown,
    strengths: Array.from(new Set(strengths)).slice(0, 8),
    gaps: Array.from(new Set(allGaps)).slice(0, 8),
  }
}

export function draftTailoredArtifacts(parsed: ParsedJobDescription, match: MatchResult, profile: CandidateProfile): TailoredArtifact {
  const selectedOutcomes = profile.quantifiedOutcomes.slice(0, 3)
  const roleWords = toWords(parsed.title)
  const leadSkill = match.strengths[0] ?? 'salesforce transformation'

  const bulletSuggestions = [
    `Delivered enterprise ${leadSkill} programs aligned to ${roleWords.slice(0, 4).join(' ') || 'role priorities'}, driving measurable operational outcomes.`,
    `Built automation and integration workflows that reduced manual cycle times and increased conversion quality across RevOps and delivery teams.`,
    `Partnered with executive stakeholders to convert ambiguous requirements into implementation plans with explicit risk controls and adoption metrics.`,
  ]

  const coverLetter = [
    `Hello Hiring Team at ${parsed.company},`,
    '',
    `I am excited to apply for the ${parsed.title} role. My background combines enterprise Salesforce delivery with AI-enabled process automation, with a track record of turning complex requirements into measurable business outcomes.`,
    '',
    `Relevant impact from recent work includes ${selectedOutcomes.join('; ')}. I would bring the same operating discipline to your team: clear requirements, fast iteration cycles, and accountable delivery against business KPIs.`,
    '',
    `Thank you for considering my application. I would welcome the opportunity to discuss how I can help your organization accelerate execution while improving quality.`,
    '',
    `Best regards,`,
    profile.fullName,
  ].join('\n')

  return {
    bulletSuggestions,
    coverLetter,
  }
}

export function createStageEvent(fromStage: ApplicationEvent['fromStage'], toStage: ApplicationEvent['toStage'], reason: string): ApplicationEvent {
  return {
    atIso: new Date().toISOString(),
    fromStage,
    toStage,
    reason,
  }
}
