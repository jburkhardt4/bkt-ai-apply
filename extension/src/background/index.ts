// BKT Apply-Macro — MV3 background service worker.
//
// Owns the session handoff (spec §8, approved "extension reads the SPA session"
// architecture): the SPA reader content script pushes the signed-in user's
// Supabase session here; this worker stores it (chrome.storage.session — memory
// only, never written to disk) and uses it to make RLS-scoped calls AS that
// user:
//   • candidate_profiles  → contact fields for autofill + location/work-auth
//     and the master-resume text for scoring (the user's own row only, RLS).
//   • score-job-fit Edge Function → the Match Score (JWT-gated; the provider key
//     stays a server-side Supabase secret — never in this bundle, BR-122).
//
// Security envelope: the ONLY credentials this worker holds are the PUBLIC anon
// key (config.ts) and the user's own JWT. No service-role key, ever. A user can
// only ever read their own rows (RLS + explicit user_id filter, BR-005).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SCORING_MODEL, SCORING_PROVIDER, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import {
  MSG,
  type AuthStatusResponse,
  type BackgroundRequest,
  type PreparedJobRef,
  type PreparedResponse,
  type ProfileResponse,
  type ScoreResponse,
  type ScrapedJob,
} from '../messages'
import type { ContactProfile } from '../payload'
import { preparedToPayload, type PreparedFieldRow } from '../preparedFill'
import type { ExtractedSession } from '../auth/session'
import type { AnswerEntry, FitPanelData } from '../types'
import { toAnswerEntries, type ApplicationAnswerRow } from '../configs/answerSignals'

const SESSION_KEY = 'bktSession'
const DOCUMENTS_BUCKET = 'documents'
const MAX_RESUME_CHARS = 12_000

// --- Session store (memory-only, extension-private) -------------------------

async function storeSession(session: ExtractedSession | null): Promise<void> {
  try {
    if (!session || !session.accessToken) {
      await chrome.storage.session.remove(SESSION_KEY)
      return
    }
    await chrome.storage.session.set({ [SESSION_KEY]: session })
  } catch {
    // best-effort; a failed store just means the next request reports needs_login
  }
}

async function getStoredSession(): Promise<ExtractedSession | null> {
  try {
    const out = await chrome.storage.session.get(SESSION_KEY)
    const s = out[SESSION_KEY] as ExtractedSession | undefined
    if (!s || !s.accessToken || !s.url) return null
    // Expired (expires_at is unix seconds)? Treat as signed out; the SPA reader
    // re-pushes a refreshed token on next focus.
    if (typeof s.expiresAt === 'number' && s.expiresAt * 1000 <= Date.now()) return null
    return s
  } catch {
    return null
  }
}

/** A Supabase client scoped to the signed-in user: public anon key as `apikey`,
 *  the user's JWT as `Authorization` → PostgREST/Functions see the user and RLS
 *  confines every read to their own rows. persistSession:false keeps it
 *  service-worker-safe (no localStorage in an SW). */
function makeUserClient(session: ExtractedSession): SupabaseClient {
  // Pair the URL + anon key from the SAME configured project (config.ts); fall
  // back to the ref-derived URL only when the build injected no URL (dev).
  const url = SUPABASE_URL || session.url
  return createClient(url, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  })
}

// --- candidate_profiles + resume text ---------------------------------------

/** EEO/demographic disclosures as stored in candidate_profiles.eeo_disclosures
 *  (jsonb). All optional — the user discloses what they choose. */
interface EeoDisclosures {
  gender?: string | null
  race_ethnicity?: string | null
  hispanic_latino?: string | null
  veteran_status?: string | null
  disability_status?: string | null
}

interface CandidateProfileRow {
  full_name: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  email: string | null
  phone: string | null
  phone_country: string | null
  linkedin_url: string | null
  website_url: string | null
  location: string | null
  state: string | null
  work_authorization: string | null
  requires_sponsorship: boolean | null
  eeo_disclosures: EeoDisclosures | null
  master_resume_path: string | null
}

// Selected columns kept in one place so the typed Row and the PostgREST select
// can never drift. Adds the expanded ATS field set (preferred name, phone
// country, state, website, sponsorship, EEO) to the original 5 contact fields.
const PROFILE_COLUMNS =
  'full_name,first_name,last_name,preferred_name,email,phone,phone_country,linkedin_url,website_url,location,state,work_authorization,requires_sponsorship,eeo_disclosures,master_resume_path'

async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<CandidateProfileRow | null> {
  let query = supabase.from('candidate_profiles').select(PROFILE_COLUMNS)
  // RLS is the security boundary; the explicit filter honors BR-005 when we know
  // the user id (we always do, from the session).
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.maybeSingle()
  if (error) return null
  return (data as CandidateProfileRow | null) ?? null
}

/** The user's pre-stored standing answers (application_answers table) as enriched
 *  AnswerEntry[] — question_label drives the B4 label matcher, plus alias phrasings
 *  + the review-gate flag (answerSignals). RLS-scoped to the user's own rows
 *  (BR-005); best-effort — never throws. Used for autofill ONLY, NEVER sent to the
 *  LLM. Sensitive answers stay review-gated in the macro (BR-156). */
async function fetchAnswerEntries(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<AnswerEntry[]> {
  try {
    let query = supabase
      .from('application_answers')
      .select('question_key,question_label,answer,answer_type')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error || !data) return []
    return toAnswerEntries(data as ApplicationAnswerRow[])
  } catch {
    return []
  }
}

/** Reads the jsonb eeo_disclosures into a flat string map, dropping null/empty
 *  values so the payload builder only emits disclosed fields. */
function toEeoMap(eeo: EeoDisclosures | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!eeo || typeof eeo !== 'object') return out
  for (const [key, value] of Object.entries(eeo)) {
    if (typeof value === 'string' && value.trim()) out[key] = value
  }
  return out
}

function isTextPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.trim().toLowerCase().endsWith('.txt')
}

async function downloadText(supabase: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
    if (error || !data) return null
    const text = (await data.text()).trim()
    if (!text) return null
    return text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) : text
  } catch {
    return null
  }
}

/** Best-effort master resume as plain text (mirrors candidateProfileService):
 *  master_resume_path when .txt, else the latest .txt resume document. Never
 *  throws — scoring proceeds without it when no .txt resume exists (BR-150). */
async function fetchResumeText(
  supabase: SupabaseClient,
  profile: CandidateProfileRow | null,
  userId: string | null,
): Promise<string | null> {
  try {
    const masterPath = profile?.master_resume_path
    if (isTextPath(masterPath)) {
      const fromMaster = await downloadText(supabase, masterPath)
      if (fromMaster) return fromMaster
    }
    if (!userId) return null
    const { data: docs } = await supabase
      .from('documents')
      .select('storage_path, version')
      .eq('user_id', userId)
      .eq('document_type', 'resume')
      .order('version', { ascending: false })
      .limit(5)
    for (const doc of (docs as { storage_path: string | null }[] | null) ?? []) {
      if (!isTextPath(doc.storage_path)) continue
      const fromDoc = await downloadText(supabase, doc.storage_path)
      if (fromDoc) return fromDoc
    }
    return null
  } catch {
    return null
  }
}

// --- Scoring -----------------------------------------------------------------

interface EdgeScore {
  overall_score: number
  recommendation: 'apply' | 'consider' | 'reject'
  strengths: string[]
  gaps: string[]
}

function toFitPanelData(s: EdgeScore): FitPanelData {
  const rec =
    s.recommendation === 'apply' || s.recommendation === 'consider' || s.recommendation === 'reject'
      ? s.recommendation
      : null
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    score: typeof s.overall_score === 'number' ? s.overall_score : 0,
    recommendation: rec,
    matched: arr(s.strengths),
    missing: arr(s.gaps),
    estimated: false,
  }
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return 'unknown error'
}

async function handleScore(job: ScrapedJob): Promise<ScoreResponse> {
  const session = await getStoredSession()
  if (!session) return { ok: false, reason: 'needs_login' }
  try {
    const supabase = makeUserClient(session)
    const profileRow = await fetchProfileRow(supabase, session.userId)
    const resumeText = await fetchResumeText(supabase, profileRow, session.userId)
    // Fit-relevant fields only — no contact PII to the LLM. resumeText, when
    // present, is the authoritative source per score-job-fit's system prompt.
    const profile = {
      location: profileRow?.location ?? null,
      workAuthorization: profileRow?.work_authorization ?? null,
      websiteUrl: profileRow?.website_url ?? null,
      ...(resumeText ? { resumeText } : {}),
    }
    const { data, error } = await supabase.functions.invoke('score-job-fit', {
      body: {
        provider: SCORING_PROVIDER,
        model: SCORING_MODEL,
        job: { title: job.title, description: job.description, url: job.url },
        profile,
      },
    })
    if (error) return { ok: false, reason: 'error', message: errMessage(error) }
    const score = (data as { score?: EdgeScore } | null)?.score
    if (!score) return { ok: false, reason: 'error', message: 'empty score response' }
    return { ok: true, score: toFitPanelData(score) }
  } catch (e) {
    return { ok: false, reason: 'error', message: errMessage(e) }
  }
}

async function handleProfile(): Promise<ProfileResponse> {
  const session = await getStoredSession()
  if (!session) return { ok: false, reason: 'needs_login' }
  try {
    const supabase = makeUserClient(session)
    // Profile row and screener answers are independent reads → run concurrently
    // so the extra table adds no serial latency to the (human-triggered) autofill.
    const [row, answers] = await Promise.all([
      fetchProfileRow(supabase, session.userId),
      fetchAnswerEntries(supabase, session.userId),
    ])
    if (!row) return { ok: false, reason: 'no_profile' }
    const eeo = toEeoMap(row.eeo_disclosures)
    const profile: ContactProfile = {
      fullName: row.full_name ?? undefined,
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      preferredName: row.preferred_name ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      phoneCountry: row.phone_country ?? undefined,
      linkedin: row.linkedin_url ?? undefined,
      website: row.website_url ?? undefined,
      location: row.location ?? undefined,
      state: row.state ?? undefined,
      workAuthorization: row.work_authorization ?? undefined,
      requiresSponsorship: typeof row.requires_sponsorship === 'boolean' ? row.requires_sponsorship : undefined,
      ...(Object.keys(eeo).length ? { eeo } : {}),
    }
    return { ok: true, profile, answers }
  } catch (e) {
    return { ok: false, reason: 'error', message: errMessage(e) }
  }
}

// --- Prepared applications ---------------------------------------------------

/** Columns read from prepared_applications. The unique upsert key is
 *  (user_id, job_id WHERE job_id IS NOT NULL); when the page has no job_id we
 *  fall back to matching job_ref->>source_url. */
const PREPARED_COLUMNS = 'id,status,job_id,job_ref'
/** Columns read from prepared_application_fields → preparedToPayload consumes
 *  the gate flags + value. */
const PREPARED_FIELD_COLUMNS =
  'field_key,mapped_value,free_text_draft,review_gate,is_sensitive'

interface PreparedRow {
  id: string
  status: string | null
}

/** Resolves the user's prepared_applications row for this page: by job_id when
 *  the page supplied one (hits the unique index), else by job_ref->>source_url.
 *  RLS confines the read to the user's own rows; the explicit user_id filter
 *  honors BR-005. Best-effort — returns null on any miss/error. */
async function findPreparedRow(
  supabase: SupabaseClient,
  userId: string | null,
  job: PreparedJobRef,
): Promise<PreparedRow | null> {
  try {
    let query = supabase.from('prepared_applications').select(PREPARED_COLUMNS)
    if (userId) query = query.eq('user_id', userId)
    if (job.jobId) {
      query = query.eq('job_id', job.jobId)
    } else if (job.url) {
      // job_ref is jsonb { source_url, ... }; PostgREST ->> text match.
      query = query.eq('job_ref->>source_url', job.url)
    } else {
      return null
    }
    // Most-recent first so a re-prepared row wins; one row is expected.
    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { id?: unknown; status?: unknown }
    if (typeof row.id !== 'string') return null
    return { id: row.id, status: typeof row.status === 'string' ? row.status : null }
  } catch {
    return null
  }
}

/** Loads the prepared fields for a prepared_applications row (RLS-scoped). */
async function fetchPreparedFields(
  supabase: SupabaseClient,
  userId: string | null,
  preparedId: string,
): Promise<PreparedFieldRow[]> {
  try {
    let query = supabase
      .from('prepared_application_fields')
      .select(PREPARED_FIELD_COLUMNS)
      .eq('prepared_application_id', preparedId)
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error || !data) return []
    return data as PreparedFieldRow[]
  } catch {
    return []
  }
}

/** Returns the prepared payload (non-gated fields) + gated list + status for the
 *  page. Never throws — the content script falls back to the static-config path
 *  on any failure. The macro still never auto-submits (BR-151). */
async function handlePrepared(job: PreparedJobRef): Promise<PreparedResponse> {
  const session = await getStoredSession()
  if (!session) return { ok: false, reason: 'needs_login' }
  try {
    const supabase = makeUserClient(session)
    const row = await findPreparedRow(supabase, session.userId, job)
    if (!row) return { ok: false, reason: 'no_prep' }
    const fields = await fetchPreparedFields(supabase, session.userId, row.id)
    const { payload, gated } = preparedToPayload(fields)
    return { ok: true, payload, gated, status: row.status ?? 'prepared' }
  } catch (e) {
    return { ok: false, reason: 'error', message: errMessage(e) }
  }
}

// --- Message routing ---------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  console.info('[bkt-apply] extension installed')
})

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case MSG.SESSION_PUSH:
          await storeSession(message.session)
          sendResponse({ ok: true })
          return
        case MSG.AUTH_STATUS: {
          const s = await getStoredSession()
          const res: AuthStatusResponse = { signedIn: !!s, userId: s?.userId ?? null }
          sendResponse(res)
          return
        }
        case MSG.SCORE:
          sendResponse(await handleScore(message.job))
          return
        case MSG.PROFILE:
          sendResponse(await handleProfile())
          return
        case MSG.PREPARED:
          sendResponse(await handlePrepared(message.job))
          return
        default:
          sendResponse({ ok: false, reason: 'error', message: 'unknown message' })
      }
    } catch (e) {
      sendResponse({ ok: false, reason: 'error', message: errMessage(e) })
    }
  })()
  // Keep the message channel open for the async response.
  return true
})
