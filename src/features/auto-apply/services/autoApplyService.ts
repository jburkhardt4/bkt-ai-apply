// BKT AI-Apply — Auto-Apply data service
// Maps live Supabase rows (applications + jobs + companies + ai_scores,
// emails) into the redesigned UI's view models. Falls back to the
// design-system demo seeds when Supabase is not configured or the
// user has no rows yet, so the UI is always reviewable.
//
// Stage changes go through applicationService.transitionStage → the
// `transition_stage` RPC, which writes `application_events` (event
// sourcing non-negotiable #4).
import { getSupabaseClientSafe } from '@/lib/supabase'
import { transitionStage } from '@/features/applications/services/applicationService'
import type { PipelineStage } from '@/types/pipeline'
import type { EmailMessage, InboxData, JobMatch, JobStatus } from '../types'
import { JOBS_SEED } from '../data/jobsData'
import { INBOX_SEED } from '../data/inboxData'

export type DataSource = 'live' | 'demo'

/* ---------------- helpers ---------------- */

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 31) return `${days} days ago`
  const months = Math.round(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function stageToStatus(stage: string): JobStatus {
  if (stage === 'discovery') return 'Review'
  if (stage === 'rejected' || stage === 'ghosted') return 'Declined'
  return 'Applied'
}

function formatComp(min: number | null, max: number | null): string | undefined {
  const k = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`)
  if (min != null && max != null) return `${k(min)}–${k(max)}`
  if (min != null) return `${k(min)}+`
  if (max != null) return `Up to ${k(max)}`
  return undefined
}

/* ---------------- jobs / applications ---------------- */

interface LiveScoreRow {
  overall_score: number
  strengths: string[] | null
  gaps: string[] | null
}

interface LiveCompanyRow {
  name: string
  domain: string | null
  industry: string | null
  size_range: string | null
}

interface LiveJobJoin {
  id: string
  title: string
  location: string | null
  description: string | null
  skills: string[] | null
  compensation_min: number | null
  compensation_max: number | null
  companies: LiveCompanyRow | null
  ai_scores: LiveScoreRow[] | null
}

interface LiveApplicationRow {
  id: string
  stage: string
  match_score: number | null
  updated_at: string
  jobs: LiveJobJoin | null
}

function mapApplication(row: LiveApplicationRow): JobMatch {
  const job = row.jobs
  const company = job?.companies ?? null
  const score = job?.ai_scores?.[0] ?? null
  const about =
    company && (company.industry || company.size_range)
      ? [company.industry, company.size_range].filter(Boolean).join(' · ')
      : undefined
  return {
    id: row.id,
    applicationId: row.id,
    stage: row.stage,
    domain: company?.domain ?? undefined,
    company: company?.name ?? 'Unknown company',
    title: job?.title ?? 'Untitled role',
    score: Math.round(score?.overall_score ?? row.match_score ?? 0),
    status: stageToStatus(row.stage),
    updated: relativeTime(row.updated_at),
    comp: formatComp(job?.compensation_min ?? null, job?.compensation_max ?? null),
    location: job?.location ?? undefined,
    overview: job?.description ?? undefined,
    skills: job?.skills ?? undefined,
    keyMatches: score?.strengths ?? undefined,
    keyGaps: score?.gaps ?? undefined,
    about,
  }
}

export async function fetchJobMatches(userId: string | null): Promise<{ source: DataSource; jobs: JobMatch[] }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { source: 'demo', jobs: JOBS_SEED.jobs }
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(
        'id, stage, match_score, updated_at, jobs(id, title, location, description, skills, compensation_min, compensation_max, companies(name, domain, industry, size_range), ai_scores(overall_score, strengths, gaps))',
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as LiveApplicationRow[]
    if (rows.length === 0) return { source: 'demo', jobs: JOBS_SEED.jobs }
    return { source: 'live', jobs: rows.map(mapApplication) }
  } catch {
    return { source: 'demo', jobs: JOBS_SEED.jobs }
  }
}

/** Approve an application — live rows transition discovery → applied and
 *  write an application_events row via the transition_stage RPC. Demo rows
 *  are a client-side no-op (caller updates local state). */
export async function applyToJob(job: JobMatch, userId: string | null): Promise<void> {
  if (!job.applicationId || !userId) return
  await transitionStage({
    applicationId: job.applicationId,
    userId,
    fromStage: (job.stage ?? 'discovery') as PipelineStage,
    toStage: 'applied',
    reason: 'Approved via Auto-Apply dashboard',
  })
}

/** Decline an application — live rows transition to rejected (+ audit event). */
export async function declineJob(job: JobMatch, userId: string | null): Promise<void> {
  if (!job.applicationId || !userId) return
  await transitionStage({
    applicationId: job.applicationId,
    userId,
    fromStage: (job.stage ?? 'discovery') as PipelineStage,
    toStage: 'rejected',
    reason: 'Declined via Auto-Apply dashboard',
  })
}

/* ---------------- inbox / emails ---------------- */

const CLASSIFICATION_TO_LABEL: Record<string, string> = {
  application_confirmation: 'app-confirm',
  confirmation: 'app-confirm',
  interview_invite: 'interview-inv',
  interview_request: 'interview-inv',
  interview_followup: 'interview-fu',
  interview_feedback: 'interview-fb',
  assessment_invite: 'assess-inv',
  assessment: 'assess-inv',
  assessment_result: 'assess-res',
  rejection: 'rejected',
  offer: 'hired',
  hired: 'hired',
  otp: 'otp',
  otp_verification: 'otp',
  eeo: 'eeo',
  eeo_form: 'eeo',
}

interface LiveEmailRow {
  id: string
  from_address: string
  subject: string | null
  body_snippet: string | null
  classification: string
  received_at: string
  processed_at: string | null
}

function mapEmail(row: LiveEmailRow): EmailMessage {
  const domain = row.from_address.split('@')[1] ?? undefined
  const senderName = (row.from_address.split('@')[0] ?? row.from_address).replace(/[._-]+/g, ' ')
  const label = CLASSIFICATION_TO_LABEL[row.classification] ?? 'other'
  return {
    id: row.id,
    domain,
    from: row.from_address,
    sender: senderName.replace(/\b\w/g, (c) => c.toUpperCase()),
    subject: row.subject ?? '(no subject)',
    label,
    priority: label === 'interview-inv' || label === 'assess-inv' ? 'High' : 'Low',
    unread: row.processed_at == null,
    time: row.received_at,
    body: row.body_snippet ? [row.body_snippet] : ['(no preview available)'],
  }
}

export async function fetchInbox(userId: string | null): Promise<{ source: DataSource; inbox: InboxData }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { source: 'demo', inbox: INBOX_SEED }
  try {
    const { data, error } = await supabase
      .from('emails')
      .select('id, from_address, subject, body_snippet, classification, received_at, processed_at')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as LiveEmailRow[]
    if (rows.length === 0) return { source: 'demo', inbox: INBOX_SEED }
    return {
      source: 'live',
      inbox: {
        ...INBOX_SEED,
        emails: rows.map(mapEmail),
        total: rows.length,
      },
    }
  } catch {
    return { source: 'demo', inbox: INBOX_SEED }
  }
}
