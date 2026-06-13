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
import { transitionStage, type AuditEventRow } from '@/features/applications/services/applicationService'
import type { PipelineStage } from '@/types/pipeline'
import type { EmailMessage, InboxData, JobMatch, JobStatus, SavedJob, SearchJob } from '../types'
import { JOBS_SEED } from '../data/jobsData'
import { INBOX_SEED } from '../data/inboxData'
import { SEARCH_SEED } from '../data/searchData'
import { SAVED_SEED } from '../data/savedData'

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

// Consolidated chip taxonomy (2026-06-13): Interviewing absorbs invite/
// follow-up/feedback, Assessment absorbs invite/result, Action Required
// absorbs OTP/EEO. Unlisted classifications (outreach, follow_up, unknown)
// fall back to 'other'.
const CLASSIFICATION_TO_LABEL: Record<string, string> = {
  application_confirmation: 'app-confirm',
  confirmation: 'app-confirm',
  interview_invite: 'interviewing',
  interview_request: 'interviewing',
  interview_followup: 'interviewing',
  interview_feedback: 'interviewing',
  assessment_invite: 'assessment',
  assessment: 'assessment',
  assessment_result: 'assessment',
  rejection: 'rejected',
  offer: 'offer',
  hired: 'hired',
  otp: 'action-required',
  otp_verification: 'action-required',
  eeo: 'action-required',
  eeo_form: 'action-required',
}

interface LiveEmailRow {
  id: string
  from_address: string
  subject: string | null
  body_snippet: string | null
  classification: string
  received_at: string
  processed_at: string | null
  gmail_labels: string[] | null
}

/** gmail_label_map rows: Gmail label name (lowercased) → inbox chip id. */
type LabelDisplayMap = Map<string, string>

function mapEmail(row: LiveEmailRow, labelDisplay: LabelDisplayMap): EmailMessage {
  const domain = row.from_address.split('@')[1] ?? undefined
  const senderName = (row.from_address.split('@')[0] ?? row.from_address).replace(/[._-]+/g, ' ')
  // BR-037: JB's Gmail label drives the chip when mapped; classification fallback.
  const labelFromGmail = (row.gmail_labels ?? [])
    .map((name) => labelDisplay.get(name.trim().toLowerCase()))
    .find((display) => display != null)
  const label = labelFromGmail ?? CLASSIFICATION_TO_LABEL[row.classification] ?? 'other'
  return {
    id: row.id,
    domain,
    from: row.from_address,
    sender: senderName.replace(/\b\w/g, (c) => c.toUpperCase()),
    subject: row.subject ?? '(no subject)',
    label,
    priority: label === 'interviewing' || label === 'assessment' ? 'High' : 'Low',
    unread: row.processed_at == null,
    time: row.received_at,
    body: row.body_snippet ? [row.body_snippet] : ['(no preview available)'],
  }
}

export async function fetchInbox(userId: string | null): Promise<{ source: DataSource; inbox: InboxData }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { source: 'demo', inbox: INBOX_SEED }
  try {
    const [emailsResult, labelMapResult] = await Promise.all([
      supabase
        .from('emails')
        .select('id, from_address, subject, body_snippet, classification, received_at, processed_at, gmail_labels')
        .eq('user_id', userId)
        .order('received_at', { ascending: false })
        .limit(200),
      supabase.from('gmail_label_map').select('gmail_label, display_label').eq('user_id', userId),
    ])
    if (emailsResult.error) throw new Error(emailsResult.error.message)
    const rows = (emailsResult.data ?? []) as unknown as LiveEmailRow[]
    if (rows.length === 0) return { source: 'demo', inbox: INBOX_SEED }

    const labelDisplay: LabelDisplayMap = new Map(
      ((labelMapResult.data ?? []) as { gmail_label: string; display_label: string }[]).map(
        (entry) => [entry.gmail_label.trim().toLowerCase(), entry.display_label],
      ),
    )
    return {
      source: 'live',
      inbox: {
        ...INBOX_SEED,
        emails: rows.map((row) => mapEmail(row, labelDisplay)),
        total: rows.length,
      },
    }
  } catch {
    return { source: 'demo', inbox: INBOX_SEED }
  }
}

/* ---------------- search / saved board (Phase 2 data backbone) ---------------- */

const JOB_SELECT =
  'id, title, location, description, skills, compensation_min, compensation_max, remote_type, job_type, posted_at, created_at, companies(name, domain, industry, size_range), ai_scores(overall_score, strengths, gaps)'

interface LiveSearchJobRow {
  id: string
  title: string
  location: string | null
  description: string | null
  skills: string[] | null
  compensation_min: number | null
  compensation_max: number | null
  remote_type: string | null
  job_type: string | null
  posted_at: string | null
  created_at: string
  companies: LiveCompanyRow | null
  ai_scores: LiveScoreRow[] | null
}

function mapJob(row: LiveSearchJobRow): SearchJob {
  const company = row.companies
  const score = row.ai_scores?.[0] ?? null
  const chips = [row.remote_type, row.job_type].filter((c): c is string => Boolean(c))
  const about =
    company && (company.industry || company.size_range)
      ? [company.industry, company.size_range].filter(Boolean).join(' · ')
      : undefined
  return {
    id: row.id,
    domain: company?.domain ?? undefined,
    company: company?.name ?? 'Unknown company',
    industry: company?.industry ?? '',
    posted: relativeTime(row.posted_at ?? row.created_at),
    title: row.title,
    chips: chips.length > 0 ? chips : (row.skills ?? []).slice(0, 3),
    score: Math.round(score?.overall_score ?? 0),
    location: row.location ?? undefined,
    overview: row.description ?? undefined,
    skills: row.skills ?? undefined,
    keyMatches: score?.strengths ?? undefined,
    keyGaps: score?.gaps ?? undefined,
    about,
  }
}

export interface SearchBoard {
  source: DataSource
  jobs: SearchJob[]
  /** job_ids already applied to (have an application row). */
  appliedIds: string[]
  /** job_ids bookmarked in saved_jobs. */
  savedIds: string[]
}

/** Search board from real `jobs` rows + the user's applied/saved sets.
 *  Falls back to the design seeds when Supabase is unconfigured or empty. */
export async function fetchSearchBoard(userId: string | null): Promise<SearchBoard> {
  const demo: SearchBoard = { source: 'demo', jobs: SEARCH_SEED.jobs, appliedIds: [], savedIds: [] }
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return demo
  try {
    const [jobsResult, appsResult, savedResult] = await Promise.all([
      supabase.from('jobs').select(JOB_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
      supabase.from('applications').select('job_id').eq('user_id', userId),
      supabase.from('saved_jobs').select('job_id').eq('user_id', userId),
    ])
    if (jobsResult.error) throw new Error(jobsResult.error.message)
    const rows = (jobsResult.data ?? []) as unknown as LiveSearchJobRow[]
    if (rows.length === 0) return demo
    const appliedIds = ((appsResult.data ?? []) as { job_id: string }[]).map((r) => r.job_id)
    const savedIds = ((savedResult.data ?? []) as { job_id: string }[]).map((r) => r.job_id)
    return { source: 'live', jobs: rows.map(mapJob), appliedIds, savedIds }
  } catch {
    return demo
  }
}

interface LiveSavedRow {
  job_id: string
  created_at: string
  jobs: LiveSearchJobRow | null
}

function mapSaved(row: LiveSavedRow): SavedJob {
  const job = row.jobs ? mapJob(row.jobs) : null
  return {
    id: row.job_id,
    title: job?.title ?? 'Untitled role',
    saved: relativeTime(row.created_at),
    chips: job?.chips ?? [],
    allChips: job?.skills ?? job?.chips ?? [],
    desc: job?.overview ?? '',
    domain: job?.domain,
    company: job?.company,
    score: job?.score,
    industry: job?.industry,
    posted: job?.posted,
    overview: job?.overview,
    skills: job?.skills,
    level: job?.level,
    location: job?.location,
  }
}

/** Saved jobs from `saved_jobs` joined to the posting. Seed fallback when empty. */
export async function fetchSavedJobs(userId: string | null): Promise<{ source: DataSource; jobs: SavedJob[] }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { source: 'demo', jobs: SAVED_SEED.jobs }
  try {
    const { data, error } = await supabase
      .from('saved_jobs')
      .select(`job_id, created_at, jobs(${JOB_SELECT})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as LiveSavedRow[]
    if (rows.length === 0) return { source: 'demo', jobs: SAVED_SEED.jobs }
    return { source: 'live', jobs: rows.map(mapSaved) }
  } catch {
    return { source: 'demo', jobs: SAVED_SEED.jobs }
  }
}

/** Bookmark a posting (idempotent — duplicate saves are ignored). */
export async function saveJob(userId: string | null, jobId: string): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return
  const { error } = await supabase.from('saved_jobs').insert({ user_id: userId, job_id: jobId })
  if (error && error.code !== '23505') throw new Error(error.message)
}

/** Remove a bookmark. */
export async function unsaveJob(userId: string | null, jobId: string): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return
  const { error } = await supabase.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId)
  if (error) throw new Error(error.message)
}

/** Auto-apply to a discovered posting: ensure an application exists, then
 *  transition discovery → applied via the `transition_stage` RPC (which
 *  writes the application_events audit row — event-sourcing non-negotiable).
 *  Returns { applied:false } when the posting is already past discovery. */
export async function autoApplyToJob(userId: string | null, jobId: string): Promise<{ applied: boolean }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { applied: false }
  const existing = await supabase.from('applications').select('id, stage').eq('user_id', userId).eq('job_id', jobId).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  let application = existing.data as { id: string; stage: string } | null
  if (!application) {
    const inserted = await supabase.from('applications').insert({ user_id: userId, job_id: jobId, stage: 'discovery' }).select('id, stage').single()
    if (inserted.error) throw new Error(inserted.error.message)
    application = inserted.data as { id: string; stage: string }
  }
  if (application.stage !== 'discovery') return { applied: false }
  await transitionStage({
    applicationId: application.id,
    userId,
    fromStage: 'discovery',
    toStage: 'applied',
    reason: 'Auto-applied via Search',
  })
  return { applied: true }
}

/* ---------------- application timeline (Phase 2 audit log) ---------------- */

export interface TimelineEvent {
  id: string
  title: string
  actor: string
  at: string
  reason: string | null
}

const STAGE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  applied: 'Applied',
  screening: 'Screening',
  interview_scheduled: 'Interview Scheduled',
  interview_complete: 'Interview Complete',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
}

const ACTOR_LABELS: Record<string, string> = {
  user: 'You',
  gmail_scraper: 'Gmail',
  calendar_scraper: 'Calendar',
  system: 'System',
}

function prettyStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ')
}

function mapTimelineEvent(row: AuditEventRow): TimelineEvent {
  const title =
    row.from_stage && row.to_stage
      ? `${prettyStage(row.from_stage)} → ${prettyStage(row.to_stage)}`
      : prettyStage(row.to_stage ?? row.event_type)
  return {
    id: row.id,
    title,
    actor: ACTOR_LABELS[row.actor] ?? row.actor,
    at: relativeTime(row.created_at),
    reason: row.reason,
  }
}

/** Event-sourced timeline for an application (application_events), newest
 *  first. Returns [] in demo mode or when there is no application yet. */
export async function fetchApplicationTimeline(
  userId: string | null,
  applicationId: string | null | undefined,
): Promise<TimelineEvent[]> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId || !applicationId) return []
  try {
    const { data, error } = await supabase
      .from('application_events')
      .select('*')
      .eq('application_id', applicationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as AuditEventRow[]).map(mapTimelineEvent)
  } catch {
    return []
  }
}
