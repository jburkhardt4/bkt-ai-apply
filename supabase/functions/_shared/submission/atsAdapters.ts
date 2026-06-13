/**
 * ATS channel adapters — Greenhouse / Lever / Ashby (ADR-006 §4, BR-134).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ GAP-010 — UNVALIDATED. These adapters are built to the DOCUMENTED public  │
 * │ application-endpoint contracts of each ATS, but the real per-board        │
 * │ identifiers and the candidate application payload (name/email/resume      │
 * │ file/answers) are NOT yet wired into the pipeline. None of these adapters  │
 * │ will fire a real POST until that configuration is present.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * HARD RULE (brief + BR-134): no adapter blind-fires and no adapter fabricates
 * candidate data. Each adapter attempts the real POST ONLY when BOTH:
 *   (1) the board identifier (board token / board id) is resolvable, AND
 *   (2) a candidate application payload is present.
 * Otherwise it returns a structured failure:
 *   { success:false, channel:'ats', error:'channel_not_configured',
 *     metadata:{ vendor, reason:'GAP-010 ATS payload/board config not wired' } }
 * The worker then finalizes that row as failed (credit refunded by the RPC) and
 * the failure is visible in application_events — never a silent or faked submit.
 *
 * The request builders below are written so wiring real config later is a small,
 * local change: drop a board id + candidate payload into the resolver functions
 * and the POST path lights up unchanged. Endpoint shapes are cited inline.
 *
 * ── Documented endpoint contracts (cited; GAP-010 = unverified) ──────────────
 * Greenhouse (Job Board API v1):
 *   POST https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
 *   multipart/form-data — first_name,last_name,email,(phone),resume (file),
 *   plus mapped question fields. Public board, no auth header for the apply POST.
 *   board_token = the company slug from boards.greenhouse.io/{board_token}.
 *
 * Lever (Postings apply API):
 *   POST https://api.lever.co/v0/postings/{site}/{postingId}?key=...  (or the
 *   public form-backed endpoint). multipart — name,email,resume (file),urls,
 *   cards/answers. site + postingId derive from jobs.lever.co/{site}/{postingId}.
 *
 * Ashby (Application API):
 *   POST https://api.ashbyhq.com/applicationForm.submit  (JSON) with a
 *   jobPostingId + fieldSubmissions[] (incl. a resume file submission). Requires
 *   the posting id from jobs.ashbyhq.com/{org}/{postingId} and a candidate
 *   payload. Public application form submit (no API key on the candidate path).
 */

import type { AtsVendor, SubmissionAdapter, SubmissionInput, SubmissionOutcome } from './types.ts'

// ---------------------------------------------------------------------------
// Configuration resolution (GAP-010 wiring point)
//
// These resolvers are the single place to wire real config later. Today they
// only resolve a board identifier from the URL when it is unambiguous from the
// public host path; they NEVER produce a candidate payload (we have none), so
// every adapter currently short-circuits to channel_not_configured.
// ---------------------------------------------------------------------------

/** Candidate application payload. Intentionally unpopulated in this build — we
 *  do NOT have real candidate data wired (resume file, answers). When wired,
 *  this is produced from the application + generated documents, NOT fabricated. */
interface CandidatePayload {
  firstName: string
  lastName: string
  email: string
  /** Resume as a fetchable URL or bytes — wired from the documents pipeline. */
  resume: { url: string } | { bytes: Uint8Array; filename: string }
  /** Mapped screening-question answers, keyed by vendor field id. */
  answers?: Record<string, string>
}

/**
 * Resolve a candidate payload for an application. Returns null in this build:
 * the candidate data + resume file are GAP-010 follow-up wiring. Returning null
 * forces every adapter down the not-configured path rather than fabricating a
 * person. (Signature kept so the future wiring is a one-function change — the
 * `input` is where the application/job context for sourcing the real payload
 * will be read from.)
 */
function resolveCandidatePayload(input: SubmissionInput): CandidatePayload | null {
  // GAP-010: candidate/resume payload not yet sourced from the documents
  // pipeline. We deliberately do NOT fabricate candidate data. The follow-up
  // wiring will derive the payload from input.applicationId / input.jobId.
  void input
  return null
}

/** Parsed board identifiers for each vendor, derived from the public URL path. */
interface GreenhouseBoard { boardToken: string; jobId: string }
interface LeverBoard { site: string; postingId: string }
interface AshbyBoard { org: string; postingId: string }

/** boards.greenhouse.io/{board_token}/jobs/{job_id} → identifiers (best-effort). */
function resolveGreenhouseBoard(sourceUrl: string): GreenhouseBoard | null {
  // Allow env-provided board token override for cases where the URL is opaque.
  const envToken = Deno.env.get('GREENHOUSE_BOARD_TOKEN') ?? ''
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean) // e.g. ['acme','jobs','12345']
    const boardToken = envToken || parts[0] || ''
    const jobsIdx = parts.indexOf('jobs')
    const jobId = jobsIdx >= 0 ? (parts[jobsIdx + 1] ?? '') : ''
    if (boardToken && jobId) return { boardToken, jobId }
  } catch {
    /* fall through */
  }
  return null
}

/** jobs.lever.co/{site}/{postingId} → identifiers (best-effort). */
function resolveLeverBoard(sourceUrl: string): LeverBoard | null {
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean) // ['site','postingId']
    const site = parts[0] ?? ''
    const postingId = parts[1] ?? ''
    if (site && postingId) return { site, postingId }
  } catch {
    /* fall through */
  }
  return null
}

/** jobs.ashbyhq.com/{org}/{postingId} → identifiers (best-effort). */
function resolveAshbyBoard(sourceUrl: string): AshbyBoard | null {
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean) // ['org','postingId']
    const org = parts[0] ?? ''
    const postingId = parts[1] ?? ''
    if (org && postingId) return { org, postingId }
  } catch {
    /* fall through */
  }
  return null
}

/** Uniform "we have a vendor + URL but cannot submit yet" failure outcome. */
function notConfigured(vendor: AtsVendor, detail: string): SubmissionOutcome {
  return {
    success: false,
    channel: 'ats',
    error: 'channel_not_configured',
    metadata: {
      vendor,
      reason: 'GAP-010 ATS payload/board config not wired',
      detail,
    },
  }
}

// ---------------------------------------------------------------------------
// Adapters
//
// Each adapter: resolve board → resolve candidate → if EITHER missing, return
// channel_not_configured (no POST). Only with BOTH present do we build + send
// the documented request. The build/POST branch is structured and ready, but is
// unreachable today because resolveCandidatePayload returns null by design.
// ---------------------------------------------------------------------------

export const greenhouseAdapter: SubmissionAdapter = async (
  input: SubmissionInput,
): Promise<SubmissionOutcome> => {
  const board = resolveGreenhouseBoard(input.sourceUrl)
  const candidate = resolveCandidatePayload(input)
  if (!board || !candidate) {
    return notConfigured('greenhouse', !board ? 'board_token/job_id unresolved' : 'candidate payload absent')
  }

  // Documented: POST boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
  // multipart/form-data with first_name,last_name,email,resume(file),answers.
  const endpoint =
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardToken)}` +
    `/jobs/${encodeURIComponent(board.jobId)}`
  const form = buildGreenhouseForm(candidate)
  return await sendAtsForm('greenhouse', endpoint, form, input)
}

export const leverAdapter: SubmissionAdapter = async (
  input: SubmissionInput,
): Promise<SubmissionOutcome> => {
  const board = resolveLeverBoard(input.sourceUrl)
  const candidate = resolveCandidatePayload(input)
  if (!board || !candidate) {
    return notConfigured('lever', !board ? 'site/postingId unresolved' : 'candidate payload absent')
  }

  // Documented: POST api.lever.co/v0/postings/{site}/{postingId} multipart with
  // name,email,resume(file),urls,answers.
  const endpoint =
    `https://api.lever.co/v0/postings/${encodeURIComponent(board.site)}/${encodeURIComponent(board.postingId)}`
  const form = buildLeverForm(candidate)
  return await sendAtsForm('lever', endpoint, form, input)
}

export const ashbyAdapter: SubmissionAdapter = async (
  input: SubmissionInput,
): Promise<SubmissionOutcome> => {
  const board = resolveAshbyBoard(input.sourceUrl)
  const candidate = resolveCandidatePayload(input)
  if (!board || !candidate) {
    return notConfigured('ashby', !board ? 'org/postingId unresolved' : 'candidate payload absent')
  }

  // Documented: POST api.ashbyhq.com/applicationForm.submit (JSON) with
  // jobPostingId + fieldSubmissions[] (incl. resume file submission).
  const endpoint = 'https://api.ashbyhq.com/applicationForm.submit'
  const body = buildAshbyBody(board.postingId, candidate)
  return await sendAshbyJson(endpoint, body, input)
}

/** vendor → adapter, selected by resolveChannel's detected vendor. */
export const atsAdapters: Record<AtsVendor, SubmissionAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
}

// ---------------------------------------------------------------------------
// Request builders (structured for the future wiring; unreachable today).
// ---------------------------------------------------------------------------

function appendResume(form: FormData, candidate: CandidatePayload): void {
  if ('bytes' in candidate.resume) {
    form.append('resume', new Blob([candidate.resume.bytes]), candidate.resume.filename)
  } else {
    // URL-based resume: the wiring step fetches + attaches the bytes; we record
    // the URL so the builder stays declarative until that fetch is implemented.
    form.append('resume_url', candidate.resume.url)
  }
}

function buildGreenhouseForm(candidate: CandidatePayload): FormData {
  const form = new FormData()
  form.append('first_name', candidate.firstName)
  form.append('last_name', candidate.lastName)
  form.append('email', candidate.email)
  for (const [k, v] of Object.entries(candidate.answers ?? {})) form.append(k, v)
  appendResume(form, candidate)
  return form
}

function buildLeverForm(candidate: CandidatePayload): FormData {
  const form = new FormData()
  form.append('name', `${candidate.firstName} ${candidate.lastName}`.trim())
  form.append('email', candidate.email)
  for (const [k, v] of Object.entries(candidate.answers ?? {})) form.append(k, v)
  appendResume(form, candidate)
  return form
}

function buildAshbyBody(postingId: string, candidate: CandidatePayload): Record<string, unknown> {
  return {
    jobPostingId: postingId,
    fieldSubmissions: [
      { path: 'name', value: `${candidate.firstName} ${candidate.lastName}`.trim() },
      { path: 'email', value: candidate.email },
      ...Object.entries(candidate.answers ?? {}).map(([path, value]) => ({ path, value })),
    ],
  }
}

// ---------------------------------------------------------------------------
// Transport (only reached once config is wired). Never throws to the caller:
// the worker also wraps adapter calls, but we normalize here too.
// ---------------------------------------------------------------------------

async function sendAtsForm(
  vendor: AtsVendor,
  endpoint: string,
  form: FormData,
  input: SubmissionInput,
): Promise<SubmissionOutcome> {
  try {
    const res = await fetch(endpoint, { method: 'POST', body: form })
    const ok = res.ok
    return {
      success: ok,
      channel: 'ats',
      error: ok ? undefined : `ats_http_${res.status}`,
      metadata: { vendor, endpoint, status: res.status, applicationId: input.applicationId },
    }
  } catch (err) {
    return {
      success: false,
      channel: 'ats',
      error: 'ats_request_failed',
      metadata: { vendor, endpoint, message: err instanceof Error ? err.message : String(err) },
    }
  }
}

async function sendAshbyJson(
  endpoint: string,
  body: Record<string, unknown>,
  input: SubmissionInput,
): Promise<SubmissionOutcome> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const ok = res.ok
    return {
      success: ok,
      channel: 'ats',
      error: ok ? undefined : `ats_http_${res.status}`,
      metadata: { vendor: 'ashby', endpoint, status: res.status, applicationId: input.applicationId },
    }
  } catch (err) {
    return {
      success: false,
      channel: 'ats',
      error: 'ats_request_failed',
      metadata: { vendor: 'ashby', endpoint, message: err instanceof Error ? err.message : String(err) },
    }
  }
}
