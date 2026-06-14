/**
 * ATS channel adapters — Greenhouse / Lever / Ashby (ADR-006 §4, BR-134).
 *
 * Each vendor is split into a PURE builder (`build*Request` → BuiltRequest) and a
 * SEND path (the `SubmissionAdapter`). The builder computes the exact endpoint +
 * field payload + any `missing[]` prerequisites WITHOUT performing I/O — this is
 * what shadow-validate writes to `submission_previews` for human review (the
 * worker calls `buildAtsRequest`). The adapter calls the builder, refuses to send
 * if anything is missing, and otherwise performs the real multipart/JSON POST
 * with the résumé bytes the worker supplies via `CandidatePayload`.
 *
 * HARD RULE (BR-134): no adapter blind-fires and none fabricates candidate data.
 * A send proceeds ONLY when the builder reports `missing.length === 0` AND a
 * résumé file is present; otherwise it returns a structured
 * `channel_not_configured` outcome carrying `missing[]` (visible in
 * application_events) — never a silent or faked submit.
 *
 * Vendor status in this build:
 *   • Greenhouse — fully sendable (public Job Board API, multipart, no auth).
 *   • Lever      — fully sendable (public postings apply endpoint, multipart).
 *   • Ashby      — builder/preview only; the candidate file upload is a separate
 *                  multi-step API (file.upload → fileHandle), tracked as a v1
 *                  limitation in `missing[]` so it never silently half-submits.
 *
 * ── Documented endpoint contracts (cited) ───────────────────────────────────
 * Greenhouse (Job Board API v1):
 *   POST https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}
 *   multipart/form-data — first_name,last_name,email,phone,resume(file),...
 * Lever (Postings apply API):
 *   POST https://api.lever.co/v0/postings/{site}/{postingId}
 *   multipart — name,email,phone,resume(file).
 * Ashby (Application API):
 *   POST https://api.ashbyhq.com/applicationForm.submit (JSON) — jobPostingId +
 *   fieldSubmissions[]; résumé requires a prior file upload (v1 limitation).
 */

import type {
  AtsVendor,
  BuiltRequest,
  CandidatePayload,
  SubmissionAdapter,
  SubmissionInput,
  SubmissionOutcome,
} from './types.ts'

// ---------------------------------------------------------------------------
// Candidate prerequisite checks (shared by every builder)
// ---------------------------------------------------------------------------

/** Required candidate fields that must be present before any real ATS send. */
function candidateMissing(candidate: CandidatePayload | null): string[] {
  if (!candidate) return ['candidate_profile']
  const missing: string[] = []
  if (!candidate.email) missing.push('email')
  if (!candidate.phone) missing.push('phone')
  if (!candidate.firstName && !candidate.fullName) missing.push('full_name')
  if (!candidate.resume) missing.push('resume_pdf')
  return missing
}

/** Uniform "vendor + URL known but cannot submit yet" failure outcome. */
function notConfigured(vendor: AtsVendor, missing: string[]): SubmissionOutcome {
  return {
    success: false,
    channel: 'ats',
    error: 'channel_not_configured',
    metadata: { vendor, missing, reason: 'GAP-010 prerequisites not met' },
  }
}

// ---------------------------------------------------------------------------
// Board identifier resolution (best-effort from the public URL path)
// ---------------------------------------------------------------------------

interface GreenhouseBoard { boardToken: string; jobId: string }
interface LeverBoard { site: string; postingId: string }
interface AshbyBoard { org: string; postingId: string }

/** boards.greenhouse.io/{board_token}/jobs/{job_id} → identifiers. */
function resolveGreenhouseBoard(sourceUrl: string): GreenhouseBoard | null {
  const envToken = Deno.env.get('GREENHOUSE_BOARD_TOKEN') ?? ''
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const boardToken = envToken || parts[0] || ''
    const jobsIdx = parts.indexOf('jobs')
    const jobId = jobsIdx >= 0 ? (parts[jobsIdx + 1] ?? '') : ''
    if (boardToken && jobId) return { boardToken, jobId }
  } catch {
    /* fall through */
  }
  return null
}

/** jobs.lever.co/{site}/{postingId} → identifiers. */
function resolveLeverBoard(sourceUrl: string): LeverBoard | null {
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const site = parts[0] ?? ''
    const postingId = parts[1] ?? ''
    if (site && postingId) return { site, postingId }
  } catch {
    /* fall through */
  }
  return null
}

/** jobs.ashbyhq.com/{org}/{postingId} → identifiers. */
function resolveAshbyBoard(sourceUrl: string): AshbyBoard | null {
  try {
    const u = new URL(sourceUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    const org = parts[0] ?? ''
    const postingId = parts[1] ?? ''
    if (org && postingId) return { org, postingId }
  } catch {
    /* fall through */
  }
  return null
}

// ---------------------------------------------------------------------------
// Pure builders (no I/O) — also power shadow-validate previews
// ---------------------------------------------------------------------------

/** Serializable candidate field summary for previews (no résumé bytes). */
function candidatePayloadSummary(candidate: CandidatePayload | null): Record<string, unknown> {
  if (!candidate) return {}
  return {
    first_name: candidate.firstName,
    last_name: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    linkedin_url: candidate.linkedinUrl,
    work_authorization: candidate.workAuthorization,
  }
}

export function buildGreenhouseRequest(
  input: SubmissionInput,
  candidate: CandidatePayload | null,
): BuiltRequest {
  const board = resolveGreenhouseBoard(input.sourceUrl)
  const missing = candidateMissing(candidate)
  if (!board) missing.push('greenhouse_board_token_or_job_id')
  const endpoint = board
    ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardToken)}` +
      `/jobs/${encodeURIComponent(board.jobId)}`
    : null
  return {
    channel: 'ats',
    vendor: 'greenhouse',
    endpoint,
    payload: candidatePayloadSummary(candidate),
    resumePath: candidate?.resumePath ?? null,
    missing,
  }
}

export function buildLeverRequest(
  input: SubmissionInput,
  candidate: CandidatePayload | null,
): BuiltRequest {
  const board = resolveLeverBoard(input.sourceUrl)
  const missing = candidateMissing(candidate)
  if (!board) missing.push('lever_site_or_posting_id')
  const endpoint = board
    ? `https://api.lever.co/v0/postings/${encodeURIComponent(board.site)}/${encodeURIComponent(board.postingId)}`
    : null
  return {
    channel: 'ats',
    vendor: 'lever',
    endpoint,
    payload: candidatePayloadSummary(candidate),
    resumePath: candidate?.resumePath ?? null,
    missing,
  }
}

export function buildAshbyRequest(
  input: SubmissionInput,
  candidate: CandidatePayload | null,
): BuiltRequest {
  const board = resolveAshbyBoard(input.sourceUrl)
  const missing = candidateMissing(candidate)
  if (!board) missing.push('ashby_org_or_posting_id')
  // v1 limitation: Ashby's candidate résumé upload is a separate multi-step API.
  // Flag it so a real send is withheld (preview still shows the intended payload).
  if (candidate?.resume) missing.push('ashby_resume_upload_v1_limitation')
  const endpoint = board ? 'https://api.ashbyhq.com/applicationForm.submit' : null
  const payload: Record<string, unknown> = {
    jobPostingId: board?.postingId ?? null,
    fieldSubmissions: candidate
      ? [
          { path: 'name', value: candidate.fullName },
          { path: 'email', value: candidate.email },
          { path: 'phone', value: candidate.phone },
        ]
      : [],
  }
  return {
    channel: 'ats',
    vendor: 'ashby',
    endpoint,
    payload,
    resumePath: candidate?.resumePath ?? null,
    missing,
  }
}

/** vendor → pure builder. Used by the worker's shadow-validate path. */
export function buildAtsRequest(
  vendor: AtsVendor,
  input: SubmissionInput,
  candidate: CandidatePayload | null,
): BuiltRequest {
  switch (vendor) {
    case 'greenhouse':
      return buildGreenhouseRequest(input, candidate)
    case 'lever':
      return buildLeverRequest(input, candidate)
    case 'ashby':
      return buildAshbyRequest(input, candidate)
  }
}

// ---------------------------------------------------------------------------
// Adapters (build → guard → send)
// ---------------------------------------------------------------------------

export const greenhouseAdapter: SubmissionAdapter = async (input, candidate) => {
  const built = buildGreenhouseRequest(input, candidate)
  if (built.missing.length > 0 || !built.endpoint || !candidate?.resume) {
    return notConfigured('greenhouse', built.missing)
  }
  const form = new FormData()
  form.append('first_name', candidate.firstName)
  form.append('last_name', candidate.lastName)
  form.append('email', candidate.email)
  form.append('phone', candidate.phone)
  if (candidate.linkedinUrl) form.append('linkedin_url', candidate.linkedinUrl)
  form.append(
    'resume',
    new Blob([candidate.resume.bytes], { type: candidate.resume.contentType }),
    candidate.resume.filename,
  )
  return sendAtsForm('greenhouse', built.endpoint, form, input)
}

export const leverAdapter: SubmissionAdapter = async (input, candidate) => {
  const built = buildLeverRequest(input, candidate)
  if (built.missing.length > 0 || !built.endpoint || !candidate?.resume) {
    return notConfigured('lever', built.missing)
  }
  const form = new FormData()
  form.append('name', candidate.fullName)
  form.append('email', candidate.email)
  form.append('phone', candidate.phone)
  form.append(
    'resume',
    new Blob([candidate.resume.bytes], { type: candidate.resume.contentType }),
    candidate.resume.filename,
  )
  return sendAtsForm('lever', built.endpoint, form, input)
}

export const ashbyAdapter: SubmissionAdapter = async (input, candidate) => {
  // Ashby résumé upload is a v1 limitation (buildAshbyRequest always flags it
  // when a résumé is present), so this path returns channel_not_configured for
  // now rather than submitting an application without the résumé attached.
  const built = buildAshbyRequest(input, candidate)
  return notConfigured('ashby', built.missing)
}

/** vendor → adapter, selected by resolveChannel's detected vendor. */
export const atsAdapters: Record<AtsVendor, SubmissionAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
}

// ---------------------------------------------------------------------------
// Transport — never throws to the caller (the worker also wraps adapter calls).
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
