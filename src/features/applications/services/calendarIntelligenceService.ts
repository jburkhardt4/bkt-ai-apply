import { getSupabaseClient } from '../../../lib/supabase'
import type { PipelineStage } from '../../../types/pipeline'
import { canTransitionStage } from '../domain/stageRules'
import { transitionStage } from './applicationService'

export interface CalendarSignalInput {
  userId: string
  calendarEventId: string
  title: string
  organizerEmail?: string | null
  attendeeEmails?: string[]
  locationOrLink?: string | null
  description?: string | null
  scheduledAtIso: string
  durationMinutes?: number | null
}

interface MatchCandidate {
  applicationId: string
  currentStage: PipelineStage
  jobTitle: string
  companyName: string
  companyDomain: string | null
  recruiterEmails: string[]
}

interface MatchResult {
  candidate: MatchCandidate | null
  score: number
  reason: string
}

export interface CalendarIntelligenceResult {
  status: 'matched' | 'skipped'
  applicationId: string | null
  transitioned: boolean
  reason: string
}

const INTERVIEW_KEYWORDS = [
  'interview',
  'screen',
  'onsite',
  'on-site',
  'hiring manager',
  'recruiter',
  'panel',
]

function normalize(value: string): string {
  return value.toLowerCase().trim()
}

function domainFromEmail(value: string): string | null {
  const parts = value.toLowerCase().split('@')
  if (parts.length !== 2 || !parts[1]) {
    return null
  }

  return parts[1]
}

function collectDomains(signal: CalendarSignalInput): string[] {
  const rawEmails = [signal.organizerEmail ?? '', ...(signal.attendeeEmails ?? [])].filter(Boolean)

  return Array.from(
    new Set(
      rawEmails
        .map((email) => domainFromEmail(email))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  )
}

function hasInterviewSignal(signal: CalendarSignalInput): boolean {
  const haystack = [signal.title, signal.description ?? '', signal.locationOrLink ?? '']
    .join(' ')
    .toLowerCase()

  return INTERVIEW_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

function scoreMatch(params: {
  signal: CalendarSignalInput
  candidate: MatchCandidate
  domains: string[]
}): number {
  const titleText = normalize(`${params.signal.title} ${params.signal.description ?? ''}`)
  let score = 0

  const companyName = normalize(params.candidate.companyName)
  if (companyName && titleText.includes(companyName)) {
    score += 5
  }

  if (params.candidate.companyDomain && params.domains.includes(params.candidate.companyDomain.toLowerCase())) {
    score += 4
  }

  const recruiterDomains = params.candidate.recruiterEmails
    .map((email) => domainFromEmail(email))
    .filter((domain): domain is string => Boolean(domain))

  if (recruiterDomains.some((domain) => params.domains.includes(domain))) {
    score += 3
  }

  const jobTitleWord = params.candidate.jobTitle.split(/\s+/)[0]?.toLowerCase()
  if (jobTitleWord && titleText.includes(jobTitleWord)) {
    score += 1
  }

  return score
}

export function findBestCalendarApplicationMatch(params: {
  signal: CalendarSignalInput
  candidates: MatchCandidate[]
}): MatchResult {
  if (!hasInterviewSignal(params.signal)) {
    return {
      candidate: null,
      score: 0,
      reason: 'Event does not look interview-related.',
    }
  }

  const domains = collectDomains(params.signal)
  let best: { candidate: MatchCandidate; score: number } | null = null

  for (const candidate of params.candidates) {
    const score = scoreMatch({
      signal: params.signal,
      candidate,
      domains,
    })

    if (!best || score > best.score) {
      best = { candidate, score }
    }
  }

  if (!best || best.score < 5) {
    return {
      candidate: null,
      score: best?.score ?? 0,
      reason: 'No application matched with sufficient confidence.',
    }
  }

  return {
    candidate: best.candidate,
    score: best.score,
    reason: 'Matched using company name/email domain heuristics.',
  }
}

async function loadMatchCandidates(userId: string): Promise<MatchCandidate[]> {
  const supabase = getSupabaseClient()

  const { data: appRows, error: appError } = await supabase
    .from('applications')
    .select('id, stage, jobs(title, company_id, companies(name, domain))')
    .eq('user_id', userId)

  if (appError) {
    throw new Error(`Failed to load applications for calendar matching: ${appError.message}`)
  }

  const { data: recruiterRows, error: recruiterError } = await supabase
    .from('recruiters')
    .select('company_id, email')
    .eq('user_id', userId)

  if (recruiterError) {
    throw new Error(`Failed to load recruiters for calendar matching: ${recruiterError.message}`)
  }

  const recruitersByCompany = new Map<string, string[]>()
  for (const recruiter of recruiterRows ?? []) {
    if (!recruiter.company_id || !recruiter.email) {
      continue
    }

    const existing = recruitersByCompany.get(recruiter.company_id) ?? []
    existing.push(recruiter.email)
    recruitersByCompany.set(recruiter.company_id, existing)
  }

  return (appRows ?? [])
    .map((row) => {
      const normalizedJob = Array.isArray(row.jobs) ? (row.jobs[0] ?? null) : row.jobs
      const normalizedCompany = normalizedJob
        ? Array.isArray(normalizedJob.companies)
          ? (normalizedJob.companies[0] ?? null)
          : normalizedJob.companies
        : null

      if (!normalizedJob || !normalizedCompany?.name) {
        return null
      }

      return {
        applicationId: row.id,
        currentStage: row.stage as PipelineStage,
        jobTitle: normalizedJob.title,
        companyName: normalizedCompany.name,
        companyDomain: normalizedCompany.domain ?? null,
        recruiterEmails: normalizedJob.company_id
          ? (recruitersByCompany.get(normalizedJob.company_id) ?? [])
          : [],
      } satisfies MatchCandidate
    })
    .filter((candidate): candidate is MatchCandidate => Boolean(candidate))
}

async function createNotification(params: {
  userId: string
  applicationId: string | null
  title: string
  body: string
  type: 'ai_signal' | 'stage_change'
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    application_id: params.applicationId,
    notification_type: params.type,
    title: params.title,
    body: params.body,
  })

  if (error) {
    throw new Error(`Failed to write calendar notification: ${error.message}`)
  }
}

export async function processCalendarSignal(input: CalendarSignalInput): Promise<CalendarIntelligenceResult> {
  const candidates = await loadMatchCandidates(input.userId)
  const match = findBestCalendarApplicationMatch({
    signal: input,
    candidates,
  })

  if (!match.candidate) {
    return {
      status: 'skipped',
      applicationId: null,
      transitioned: false,
      reason: match.reason,
    }
  }

  const supabase = getSupabaseClient()
  const { error: interviewError } = await supabase.from('interviews').insert({
    user_id: input.userId,
    application_id: match.candidate.applicationId,
    calendar_event_id: input.calendarEventId,
    interview_type: 'video',
    scheduled_at: input.scheduledAtIso,
    duration_minutes: input.durationMinutes ?? null,
    location_or_link: input.locationOrLink ?? null,
    interviewer_names: [],
    notes: input.title,
    status: 'scheduled',
  })

  if (interviewError && interviewError.code !== '23505') {
    throw new Error(`Failed to persist interview row: ${interviewError.message}`)
  }

  let transitioned = false
  let reason: string

  if (match.candidate.currentStage !== 'interview_scheduled') {
    if (canTransitionStage(match.candidate.currentStage, 'interview_scheduled')) {
      await transitionStage({
        applicationId: match.candidate.applicationId,
        userId: input.userId,
        fromStage: match.candidate.currentStage,
        toStage: 'interview_scheduled',
        reason: 'Auto-transition from calendar interview detection',
        actor: 'calendar_scraper',
      })
      transitioned = true
      reason = 'Interview matched and stage transitioned to interview_scheduled.'
    } else {
      reason = `Interview matched but transition ${match.candidate.currentStage} -> interview_scheduled is not allowed.`
    }
  } else {
    reason = 'Interview matched; application already in interview_scheduled.'
  }

  await createNotification({
    userId: input.userId,
    applicationId: match.candidate.applicationId,
    type: transitioned ? 'stage_change' : 'ai_signal',
    title: 'Interview signal detected',
    body: `${reason} Event: ${input.title}`,
  })

  return {
    status: 'matched',
    applicationId: match.candidate.applicationId,
    transitioned,
    reason,
  }
}