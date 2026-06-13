/**
 * gmail-sync — pure decision logic.
 *
 * No Deno / network / Supabase imports so the same module is unit-tested by
 * vitest (node) and executed by the Edge runtime. Ports the classification
 * rules, confidence model, stage mapping, and offer-stage protection from
 * src/features/applications/services/gmailIntelligenceService.ts (BR-030/031),
 * and adds the Gemini prompt/parse contract plus email→application matching.
 */

export type GmailClassification =
  | 'interview_invite'
  | 'rejection'
  | 'offer'
  | 'outreach'
  | 'follow_up'
  | 'unknown'

export type PipelineStage =
  | 'discovery'
  | 'applied'
  | 'screening'
  | 'interview_scheduled'
  | 'interview_complete'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'ghosted'

export interface EmailFacts {
  fromAddress: string
  subject: string | null
  snippet: string | null
}

export interface ApplicationCandidate {
  applicationId: string
  stage: PipelineStage
  companyName: string | null
  companyDomain: string | null
  jobTitle: string | null
}

export interface ClassificationDecision {
  classification: GmailClassification
  confidence: number
  source: 'gemini' | 'keywords' | 'gmail_label'
}

export const AUTO_ACTION_CONFIDENCE_THRESHOLD = 0.7

const CLASSIFICATIONS: GmailClassification[] = [
  'interview_invite',
  'rejection',
  'offer',
  'outreach',
  'follow_up',
  'unknown',
]

export function isClassification(value: unknown): value is GmailClassification {
  return typeof value === 'string' && (CLASSIFICATIONS as string[]).includes(value)
}

/* ---------------- keyword fallback classifier ---------------- */
// Rules ported 1:1 from gmailIntelligenceService.ts. Deviation: zero keyword
// matches now classifies as 'unknown' @ 0.50 (the client version fell through
// to 'follow_up' @ 0.55) — 'unknown' is what gates storage below.

interface ClassificationRule {
  classification: GmailClassification
  keywords: string[]
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    classification: 'offer',
    keywords: ['offer', 'compensation package', 'pleased to offer', 'offer letter', 'congratulations'],
  },
  {
    classification: 'rejection',
    keywords: [
      'not moving forward',
      'unfortunately',
      'regret to inform',
      'decided to move forward with other candidates',
      'decline',
      'rejected',
    ],
  },
  {
    classification: 'interview_invite',
    keywords: [
      'interview',
      'schedule',
      'availability',
      'calendar invite',
      'meet with the team',
      'technical screen',
    ],
  },
  {
    classification: 'outreach',
    keywords: [
      'reaching out',
      'opportunity',
      'your background',
      'open role',
      'connect regarding',
      'hiring for',
    ],
  },
  {
    classification: 'follow_up',
    keywords: ['follow up', 'checking in', 'circling back', 'gentle reminder', 'any updates'],
  },
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function classifyByKeywords(facts: EmailFacts): ClassificationDecision {
  const text = [facts.subject, facts.snippet, facts.fromAddress]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  let bestRule: ClassificationRule | null = null
  let bestMatches: string[] = []

  for (const rule of CLASSIFICATION_RULES) {
    const matches = rule.keywords.filter((keyword) => text.includes(keyword))
    if (matches.length > bestMatches.length) {
      bestRule = rule
      bestMatches = matches
    }
  }

  if (!bestRule || bestMatches.length === 0) {
    return { classification: 'unknown', confidence: 0.5, source: 'keywords' }
  }

  const confidence = clamp(0.58 + bestMatches.length * 0.12, 0.58, 0.97)
  return {
    classification: bestRule.classification,
    confidence: Number(confidence.toFixed(3)),
    source: 'keywords',
  }
}

/* ---------------- Gemini prompt + response contract ---------------- */

export const GEMINI_SYSTEM_PROMPT = [
  'You classify emails for a job-application tracker.',
  'Reply with a single JSON object and nothing else:',
  '{"classification":"<interview_invite|rejection|offer|outreach|follow_up|unknown>","confidence":<0..1>}',
  'Classes: interview_invite = scheduling/inviting an interview or screen;',
  'rejection = the candidacy is declined; offer = a job offer or offer logistics;',
  'outreach = a recruiter or company initiating contact about a role;',
  'follow_up = a reply/reminder continuing an existing application thread;',
  'unknown = anything not related to a job application (newsletters, receipts, personal mail).',
  'Confidence reflects how certain the classification is from the text alone.',
].join(' ')

export function buildGeminiUserMessage(facts: EmailFacts): string {
  return [
    `From: ${facts.fromAddress}`,
    `Subject: ${facts.subject ?? '(none)'}`,
    `Snippet: ${facts.snippet ?? '(none)'}`,
  ].join('\n')
}

/** Parses the model reply defensively; null → caller falls back to keywords. */
export function parseGeminiClassification(text: string): ClassificationDecision | null {
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>

  if (!isClassification(record.classification)) return null
  const rawConfidence = typeof record.confidence === 'number' ? record.confidence : NaN
  if (Number.isNaN(rawConfidence)) return null

  return {
    classification: record.classification,
    confidence: Number(clamp(rawConfidence, 0, 1).toFixed(3)),
    source: 'gemini',
  }
}

/* ---------------- email → application matching ---------------- */

/** "Jane Doe <jane@acme.com>" → "jane@acme.com"; plain addresses pass through. */
export function extractAddress(fromHeader: string): string {
  const angled = fromHeader.match(/<([^>]+)>/)
  const raw = (angled ? angled[1] : fromHeader).trim().toLowerCase()
  return raw
}

export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null
  const cleaned = domain.trim().toLowerCase().replace(/^www\./, '')
  return cleaned.length > 0 ? cleaned : null
}

export function senderDomain(fromHeader: string): string | null {
  const address = extractAddress(fromHeader)
  const at = address.lastIndexOf('@')
  if (at < 0) return null
  return normalizeDomain(address.slice(at + 1))
}

const NAME_STOPWORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'the', 'co', 'group', 'team'])

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t))
}

export interface MatchResult {
  applicationId: string
  stage: PipelineStage
  reason: string
}

/**
 * Best-effort email→application matching (heuristic, server-side):
 *   1. sender domain equals the application's company domain (strong);
 *      ties broken by job-title words appearing in the subject/snippet
 *   2. company-name token appears in subject or sender + any job-title token
 *      in subject/snippet (moderate)
 * Unmatched emails are stored with application_id = NULL for manual review.
 */
export function matchApplication(
  facts: EmailFacts,
  candidates: ApplicationCandidate[],
): MatchResult | null {
  const domain = senderDomain(facts.fromAddress)
  const haystack = `${facts.subject ?? ''} ${facts.snippet ?? ''}`.toLowerCase()
  const sender = facts.fromAddress.toLowerCase()

  const titleOverlap = (candidate: ApplicationCandidate): number => {
    if (!candidate.jobTitle) return 0
    return nameTokens(candidate.jobTitle).filter((t) => haystack.includes(t)).length
  }

  if (domain) {
    const domainMatches = candidates.filter((c) => normalizeDomain(c.companyDomain) === domain)
    if (domainMatches.length === 1) {
      const m = domainMatches[0]
      return { applicationId: m.applicationId, stage: m.stage, reason: `sender domain ${domain}` }
    }
    if (domainMatches.length > 1) {
      const ranked = [...domainMatches].sort((a, b) => titleOverlap(b) - titleOverlap(a))
      const m = ranked[0]
      return {
        applicationId: m.applicationId,
        stage: m.stage,
        reason: `sender domain ${domain} + title overlap`,
      }
    }
  }

  let best: { candidate: ApplicationCandidate; score: number } | null = null
  for (const candidate of candidates) {
    if (!candidate.companyName) continue
    const tokens = nameTokens(candidate.companyName)
    if (tokens.length === 0) continue
    const companyHit = tokens.some((t) => haystack.includes(t) || sender.includes(t))
    if (!companyHit) continue
    const score = 1 + titleOverlap(candidate)
    if (score >= 2 && (!best || score > best.score)) {
      best = { candidate, score }
    }
  }

  if (best) {
    return {
      applicationId: best.candidate.applicationId,
      stage: best.candidate.stage,
      reason: `company name + job title overlap (score ${best.score})`,
    }
  }

  return null
}

/* ---------------- Gmail label mapping (BR-037) ---------------- */

export interface LabelMapEntry {
  gmailLabel: string
  classification: GmailClassification
  displayLabel: string
}

export interface LabelResolution {
  decision: ClassificationDecision
  displayLabel: string
  matchedLabel: string
}

/** Mapped-label confidence: JB's curation is authoritative (BR-037). */
export const GMAIL_LABEL_CONFIDENCE = 0.95

// When one message carries several mapped labels, act on the most consequential.
const CLASSIFICATION_PRIORITY: GmailClassification[] = [
  'offer',
  'rejection',
  'interview_invite',
  'outreach',
  'follow_up',
  'unknown',
]

/**
 * Resolves a message's Gmail label names against the user's gmail_label_map
 * (case-insensitive). A hit overrides model classification entirely — the
 * Gemini call is skipped for mapped mail.
 */
export function resolveLabelClassification(
  labelNames: string[],
  map: LabelMapEntry[],
): LabelResolution | null {
  if (labelNames.length === 0 || map.length === 0) return null

  const byLower = new Map(map.map((entry) => [entry.gmailLabel.trim().toLowerCase(), entry]))
  const hits: { entry: LabelMapEntry; name: string }[] = []
  for (const name of labelNames) {
    const entry = byLower.get(name.trim().toLowerCase())
    if (entry) hits.push({ entry, name })
  }
  if (hits.length === 0) return null

  hits.sort(
    (a, b) =>
      CLASSIFICATION_PRIORITY.indexOf(a.entry.classification) -
      CLASSIFICATION_PRIORITY.indexOf(b.entry.classification),
  )
  const top = hits[0]
  return {
    decision: {
      classification: top.entry.classification,
      confidence: GMAIL_LABEL_CONFIDENCE,
      source: 'gmail_label',
    },
    displayLabel: top.entry.displayLabel,
    matchedLabel: top.entry.gmailLabel,
  }
}

/* ---------------- storage + auto-action policy ---------------- */

/**
 * Relevance gate: 'unknown' emails are noise (newsletters, receipts) unless
 * they came from a known application's company, or JB labeled them in Gmail
 * (BR-035) — both are kept so a curated signal is never dropped silently.
 */
export function shouldStoreEmail(
  decision: ClassificationDecision,
  matched: MatchResult | null,
  hasMappedLabel = false,
): boolean {
  return decision.classification !== 'unknown' || matched !== null || hasMappedLabel
}

const STAGE_BY_CLASSIFICATION: Partial<Record<GmailClassification, PipelineStage>> = {
  interview_invite: 'interview_scheduled',
  rejection: 'rejected',
  offer: 'offer',
}

// Ported from src/features/applications/domain/stageRules.ts — keep in sync.
const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  discovery: ['applied', 'rejected', 'ghosted'],
  applied: ['screening', 'rejected', 'ghosted'],
  screening: ['interview_scheduled', 'rejected', 'ghosted'],
  interview_scheduled: ['interview_complete', 'rejected', 'ghosted'],
  interview_complete: ['offer', 'rejected', 'ghosted'],
  offer: ['hired', 'rejected'],
  hired: [],
  rejected: [],
  ghosted: ['applied'],
}

export function canTransitionStage(from: PipelineStage, to: PipelineStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export type AutoActionPlan =
  | { action: 'transition'; toStage: PipelineStage }
  | { action: 'skip'; reason: string }

/** BR-030/BR-031 + offer-stage protection, ported from processGmailSignal. */
export function resolveAutoAction(
  decision: ClassificationDecision,
  matched: MatchResult | null,
): AutoActionPlan {
  if (decision.confidence < AUTO_ACTION_CONFIDENCE_THRESHOLD) {
    return { action: 'skip', reason: 'Confidence below 0.70; email stored without auto-action.' }
  }
  if (!matched) {
    return { action: 'skip', reason: 'Confidence met threshold but no application matched.' }
  }

  const targetStage = STAGE_BY_CLASSIFICATION[decision.classification]
  if (!targetStage) {
    return { action: 'skip', reason: 'Classification does not map to a stage transition.' }
  }
  if (decision.classification === 'rejection' && matched.stage === 'offer') {
    return {
      action: 'skip',
      reason: 'Offer-stage protection applied; rejection requires manual confirmation.',
    }
  }
  if (matched.stage === targetStage) {
    return { action: 'skip', reason: 'Application already at target stage; transition skipped.' }
  }
  if (!canTransitionStage(matched.stage, targetStage)) {
    return { action: 'skip', reason: `Transition ${matched.stage} -> ${targetStage} is not allowed.` }
  }

  return { action: 'transition', toStage: targetStage }
}

/* ---------------- cost accounting ---------------- */

// Gemini 2.5 Flash list pricing; mirrored in src/lib/ai-router.ts
// MODEL_PRICING_BY_NAME so client and server log the same numbers (BR-054).
export const GEMINI_FLASH_INPUT_USD_PER_TOKEN = 0.3 / 1_000_000
export const GEMINI_FLASH_OUTPUT_USD_PER_TOKEN = 2.5 / 1_000_000

export function estimateGeminiFlashCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    tokensIn * GEMINI_FLASH_INPUT_USD_PER_TOKEN + tokensOut * GEMINI_FLASH_OUTPUT_USD_PER_TOKEN
  )
}
