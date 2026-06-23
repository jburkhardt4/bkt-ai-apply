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
  recommendation: string | null
  reasoning_trace: Record<string, unknown> | null
}

/** A real LLM score vs an estimated one. 'heuristic_fallback' with a cost_cap
 *  reason means the full AI scoring was deferred under the monthly cap (BR-052,
 *  BR-104); any other heuristic fallback is an estimate from an Edge error. */
function deriveScoreSource(score: LiveScoreRow | null): string | undefined {
  const source = score?.reasoning_trace?.source
  return typeof source === 'string' ? source : undefined
}

/** Narrows the persisted recommendation (BR-142: derived from overall_score)
 *  to the UI union; anything unexpected is treated as absent. */
function toRecommendation(value: string | null | undefined): 'apply' | 'consider' | 'reject' | undefined {
  return value === 'apply' || value === 'consider' || value === 'reject' ? value : undefined
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
  source_url: string | null
  companies: LiveCompanyRow | null
  ai_scores: LiveScoreRow[] | null
}

interface LiveApplicationRow {
  id: string
  stage: string
  match_score: number | null
  updated_at: string
  application_url: string | null
  jobs: LiveJobJoin | null
}

function mapApplication(row: LiveApplicationRow, manualInProgressIds?: Set<string>): JobMatch {
  const job = row.jobs
  const company = job?.companies ?? null
  const score = job?.ai_scores?.[0] ?? null
  const about =
    company && (company.industry || company.size_range)
      ? [company.industry, company.size_range].filter(Boolean).join(' · ')
      : undefined
  // A discovery-stage application JB has opened for a manual apply surfaces as
  // 'In progress' (overlay only); every other stage maps via stageToStatus.
  const manualInProgress = row.stage === 'discovery' && manualInProgressIds?.has(row.id) === true
  return {
    id: row.id,
    applicationId: row.id,
    stage: row.stage,
    domain: company?.domain ?? undefined,
    company: company?.name ?? 'Unknown company',
    title: job?.title ?? 'Untitled role',
    score: Math.round(score?.overall_score ?? row.match_score ?? 0),
    status: manualInProgress ? 'In progress' : stageToStatus(row.stage),
    updated: relativeTime(row.updated_at),
    comp: formatComp(job?.compensation_min ?? null, job?.compensation_max ?? null),
    location: job?.location ?? undefined,
    overview: job?.description ?? undefined,
    skills: job?.skills ?? undefined,
    keyMatches: score?.strengths ?? undefined,
    keyGaps: score?.gaps ?? undefined,
    recommendation: toRecommendation(score?.recommendation),
    scoreSource: deriveScoreSource(score),
    about,
    sourceUrl: job?.source_url ?? undefined,
    applicationUrl: row.application_url ?? job?.source_url ?? undefined,
  }
}

/* ---- ADR-016: prospected/corpus jobs as inbox JobMatch rows ---- */

const PROSPECT_INBOX_SELECT =
  'id, title, location, description, skills, compensation_min, compensation_max, source, source_url, posted_at, created_at, companies(name, domain, industry, size_range), ai_scores(overall_score, strengths, gaps, recommendation, reasoning_trace)'

interface LiveProspectJobRow {
  id: string
  title: string
  location: string | null
  description: string | null
  skills: string[] | null
  compensation_min: number | null
  compensation_max: number | null
  source: string | null
  source_url: string | null
  posted_at: string | null
  created_at: string
  companies: LiveCompanyRow | null
  ai_scores: LiveScoreRow[] | null
}

/** Maps a prospected/corpus `jobs` row (no application yet) into a 'Review'
 *  inbox JobMatch. Carries jobId (so Apply/Decline can lazily create the
 *  application) + source (for the "Job Board" badge). applicationId is absent. */
function mapProspectJob(row: LiveProspectJobRow): JobMatch {
  const company = row.companies
  const score = row.ai_scores?.[0] ?? null
  const about =
    company && (company.industry || company.size_range)
      ? [company.industry, company.size_range].filter(Boolean).join(' · ')
      : undefined
  return {
    id: `job:${row.id}`,
    jobId: row.id,
    source: row.source ?? undefined,
    stage: 'discovery',
    status: 'Review',
    domain: company?.domain ?? undefined,
    company: company?.name ?? 'Unknown company',
    title: row.title,
    score: Math.round(score?.overall_score ?? 0),
    updated: relativeTime(row.posted_at ?? row.created_at),
    comp: formatComp(row.compensation_min, row.compensation_max),
    location: row.location ?? undefined,
    overview: row.description ?? undefined,
    skills: row.skills ?? undefined,
    keyMatches: score?.strengths ?? undefined,
    keyGaps: score?.gaps ?? undefined,
    recommendation: toRecommendation(score?.recommendation),
    scoreSource: deriveScoreSource(score),
    about,
    sourceUrl: row.source_url ?? undefined,
    applicationUrl: row.source_url ?? undefined,
  }
}

/** Prospected/corpus jobs (source IN prospector/corpus) that do NOT yet have an
 *  application, as 'Review' inbox candidates. Dedup vs `appliedJobIds` (a job
 *  with an application is shown as its application row, not duplicated here). */
async function fetchProspectInboxJobs(
  supabase: NonNullable<ReturnType<typeof getSupabaseClientSafe>>,
  userId: string,
  appliedJobIds: Set<string>,
): Promise<JobMatch[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select(PROSPECT_INBOX_SELECT)
    .eq('user_id', userId)
    .in('source', ['prospector', 'corpus'])
    // Latest ai_scores row only (versioned per job) so score?.[0] is current.
    .order('scored_at', { ascending: false, referencedTable: 'ai_scores' })
    .limit(1, { referencedTable: 'ai_scores' })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  const rows = (data ?? []) as unknown as LiveProspectJobRow[]
  return rows.filter((r) => !appliedJobIds.has(r.id)).map(mapProspectJob)
}

export async function fetchJobMatches(userId: string | null): Promise<{ source: DataSource; jobs: JobMatch[] }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { source: 'demo', jobs: JOBS_SEED.jobs }
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(
        'id, stage, match_score, updated_at, application_url, jobs(id, title, location, description, skills, compensation_min, compensation_max, source_url, companies(name, domain, industry, size_range), ai_scores(overall_score, strengths, gaps, recommendation, reasoning_trace))',
      )
      .eq('user_id', userId)
      // Embedded ai_scores are versioned per job; order desc by scored_at and
      // take only the latest so score?.[0] is the current score, not arbitrary.
      .order('scored_at', { ascending: false, referencedTable: 'jobs.ai_scores' })
      .limit(1, { referencedTable: 'jobs.ai_scores' })
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as LiveApplicationRow[]

    // Overlay: discovery-stage applications JB has opened for a manual apply
    // (review/assist modes) carry a `submission_attempt` marker event. One
    // extra scoped query resolves which of the discovery rows are 'In progress'.
    const discoveryIds = rows.filter((r) => r.stage === 'discovery').map((r) => r.id)
    let manualInProgressIds: Set<string> | undefined
    if (discoveryIds.length > 0) {
      const markers = await supabase
        .from('application_events')
        .select('application_id')
        .eq('user_id', userId)
        .eq('event_type', 'submission_attempt')
        .eq('metadata->>outcome', 'in_progress')
        .eq('metadata->>source', 'manual-apply')
        .in('application_id', discoveryIds)
      if (!markers.error) {
        manualInProgressIds = new Set(
          ((markers.data ?? []) as { application_id: string | null }[])
            .map((m) => m.application_id)
            .filter((id): id is string => id != null),
        )
      }
    }
    const appJobs = rows.map((row) => mapApplication(row, manualInProgressIds))

    // ADR-016: merge in prospected/corpus jobs that have no application yet as
    // 'Review' inbox candidates so the Dashboard is the central inbox. Dedup by
    // job_id — a job already in the pipeline shows as its application row.
    const appliedJobIds = new Set(
      rows.map((r) => r.jobs?.id).filter((id): id is string => id != null),
    )
    const prospectJobs = await fetchProspectInboxJobs(supabase, userId, appliedJobIds)

    const merged = [...appJobs, ...prospectJobs]
    if (merged.length === 0) return { source: 'demo', jobs: JOBS_SEED.jobs }
    return { source: 'live', jobs: merged }
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

/** Manual-apply (review/assist modes): JB opened the original posting to apply
 *  by hand. The application stays at stage 'discovery'; this records a
 *  best-effort `submission_attempt` marker event so the row surfaces as
 *  'In progress' across reloads/devices (derived in fetchJobMatches). It is
 *  NOT a stage transition, so it does not use the transition_stage RPC. Errors
 *  are swallowed — a missing marker must never break the optimistic UI. Demo
 *  rows (no applicationId / no Supabase) are a client-side no-op. */
export async function markManualInProgress(job: JobMatch, userId: string | null): Promise<void> {
  if (!job.applicationId || !userId) return
  const supabase = getSupabaseClientSafe()
  if (!supabase) return
  try {
    await supabase.from('application_events').insert({
      user_id: userId,
      application_id: job.applicationId,
      event_type: 'submission_attempt',
      actor: 'jb_manual',
      reason: 'Opened source posting for manual apply',
      metadata: { outcome: 'in_progress', channel: 'manual_open', source: 'manual-apply' },
    })
  } catch {
    // Best-effort marker — ignore failures so the manual-apply UX is unaffected.
  }
}

/** Confirm a manual apply (review/assist modes): transition discovery → applied
 *  via the transition_stage RPC (writes the audited application_events row).
 *  Demo rows are a client-side no-op (caller updates local state). */
export async function markManualApplied(job: JobMatch, userId: string | null): Promise<void> {
  if (!job.applicationId || !userId) return
  await transitionStage({
    applicationId: job.applicationId,
    userId,
    fromStage: (job.stage ?? 'discovery') as PipelineStage,
    toStage: 'applied',
    reason: 'Marked as applied (manual)',
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

/**
 * Trigger a live Gmail pull by invoking the `gmail-sync` Edge Function, then the
 * caller refetches `emails`. gmail-sync is deployed with verify_jwt=false and is
 * safe to invoke from the client; server-side it fetches new mail, classifies it,
 * writes `emails` rows, and auto-transitions matched applications. Returns false
 * (never throws) when Supabase is unconfigured or the call fails, so the inbox
 * Refresh button degrades gracefully to a plain refetch of existing rows.
 */
export async function triggerGmailSync(): Promise<boolean> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) return false
  try {
    const { error } = await supabase.functions.invoke('gmail-sync', { body: {} })
    return !error
  } catch {
    return false
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
  'id, title, location, description, skills, compensation_min, compensation_max, remote_type, job_type, posted_at, created_at, source_url, companies(name, domain, industry, size_range), ai_scores(overall_score, strengths, gaps, recommendation, reasoning_trace)'

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
  source_url: string | null
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
    recommendation: toRecommendation(score?.recommendation),
    scoreSource: deriveScoreSource(score),
    about,
    sourceUrl: row.source_url ?? undefined,
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
      supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('user_id', userId)
        // Latest ai_scores row only (versioned per job) so mapJob's score?.[0]
        // is the current score. Ordering the embedded resource needs both the
        // referenced .order and .limit (PostgREST).
        .order('scored_at', { ascending: false, referencedTable: 'ai_scores' })
        .limit(1, { referencedTable: 'ai_scores' })
        .order('created_at', { ascending: false })
        .limit(60),
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
      // Latest embedded ai_scores row only (nested two levels: jobs.ai_scores).
      .order('scored_at', { ascending: false, referencedTable: 'jobs.ai_scores' })
      .limit(1, { referencedTable: 'jobs.ai_scores' })
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

/** Find-or-create the user's `discovery` application for a posting. Absorbs a
 *  concurrent-create 23505 by re-fetching. Shared by autoApplyToJob (auto) and
 *  ensureApplicationForJob (the Dashboard manual-apply / decline path, ADR-016). */
async function findOrCreateDiscoveryApplication(
  supabase: NonNullable<ReturnType<typeof getSupabaseClientSafe>>,
  userId: string,
  jobId: string,
): Promise<{ id: string; stage: string }> {
  const existing = await supabase
    .from('applications')
    .select('id, stage')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data as { id: string; stage: string }

  const inserted = await supabase
    .from('applications')
    .insert({ user_id: userId, job_id: jobId, stage: 'discovery' })
    .select('id, stage')
    .single()
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const refetch = await supabase
        .from('applications')
        .select('id, stage')
        .eq('user_id', userId)
        .eq('job_id', jobId)
        .single()
      if (refetch.error) throw new Error(refetch.error.message)
      return refetch.data as { id: string; stage: string }
    }
    throw new Error(inserted.error.message)
  }
  return inserted.data as { id: string; stage: string }
}

/** ADR-016: ensure a `discovery` application exists for a prospected/corpus job
 *  (an inbox row with no pipeline footprint yet) and return its id, so the
 *  Dashboard can run the normal manual-apply / decline transitions against it.
 *  Returns null in demo mode (no Supabase / no user). */
export async function ensureApplicationForJob(userId: string | null, jobId: string): Promise<string | null> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return null
  const app = await findOrCreateDiscoveryApplication(supabase, userId, jobId)
  return app.id
}

/** Auto-apply to a discovered posting: ensure an application exists, then
 *  transition discovery → applied via the `transition_stage` RPC (which
 *  writes the application_events audit row — event-sourcing non-negotiable).
 *  Returns { applied:false } when the posting is already past discovery. */
export async function autoApplyToJob(userId: string | null, jobId: string): Promise<{ applied: boolean }> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return { applied: false }
  const application = await findOrCreateDiscoveryApplication(supabase, userId, jobId)
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
