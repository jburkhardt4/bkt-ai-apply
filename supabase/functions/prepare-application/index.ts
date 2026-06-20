/**
 * prepare-application — Edge Function (apply-macro server-side prep layer).
 *
 * Reads a posting's PUBLIC ATS form schema (auth-free read API), normalizes it,
 * maps the CALLER's own candidate data onto it, decides the gating status, and
 * persists a prepared_applications row + its prepared_application_fields. The
 * extension later consumes those fields verbatim for human-reviewed autofill.
 *
 * HARD CONSTRAINTS honored here:
 *   • On-demand path is RLS-scoped: the Supabase client is created with the
 *     PUBLIC anon key + the caller's forwarded Authorization JWT, so every read
 *     and write is the caller's own row only (BR-004/005, BR-122 — no
 *     service-role for on-demand).
 *   • NEVER auto-submits (BR-151) — this only PREPARES fields.
 *   • EEO/demographic + screener answers are loaded for AUTOFILL only and are
 *     never sent to an LLM (ADR-011).
 *   • Defended platforms (workday/other) are never headless-read — buildReadEndpoint
 *     returns null and we persist a needs_review/blocked record instead.
 *
 * Mirrors score-job-fit: Deno.serve + CORS/OPTIONS from _shared/http + JSON body.
 *
 * Contract:
 *   POST { job: { url, title?, description?, external_job_id?, job_id? },
 *          mode?: 'auto'|'hybrid', match_score?: number,
 *          prepared_by?: 'on_demand'|'cron' }
 *   →    { prepared_application_id, status, gating_reason,
 *          fields: [{ field_key, field_type, value_source, confidence,
 *                     is_sensitive, review_gate }] }
 *   err  { error, code? }
 */

import { createClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { detectAtsFamily } from '../_shared/prep/atsFamily.ts'
import { buildReadEndpoint, resolveBoardIdentifiers } from '../_shared/prep/buildReadEndpoint.ts'
import {
  parseAshbySchema,
  parseGreenhouseSchema,
  parseLeverSchema,
  parseSmartRecruitersSchema,
} from '../_shared/prep/schemaParse.ts'
import { mapFields } from '../_shared/prep/fieldMap.ts'
import { decidePrep } from '../_shared/prep/gating.ts'
import type {
  AtsFamily,
  CandidateData,
  MappedField,
  NormalizedField,
  NormalizedSchema,
  PrepMode,
  PreparedBy,
} from '../_shared/prep/types.ts'

interface RequestBody {
  job?: {
    url?: string
    title?: string
    description?: string
    external_job_id?: string
    job_id?: string
  }
  mode?: string
  match_score?: number
  prepared_by?: string
}

/** Picks the right pure parser for a family. */
function parseForFamily(family: AtsFamily, raw: unknown): NormalizedField[] {
  switch (family) {
    case 'greenhouse':
      return parseGreenhouseSchema(raw)
    case 'lever':
      return parseLeverSchema(raw)
    case 'ashby':
      return parseAshbySchema(raw)
    case 'smartrecruiters':
      return parseSmartRecruitersSchema(raw)
    case 'workday':
    case 'other':
      return []
  }
}

/** Coerces an unknown body mode to a valid PrepMode (default 'hybrid'). */
function coerceMode(mode: unknown): PrepMode {
  return mode === 'auto' ? 'auto' : 'hybrid'
}

/** Coerces an unknown prepared_by to a valid PreparedBy (default 'on_demand'). */
function coercePreparedBy(value: unknown): PreparedBy {
  return value === 'cron' ? 'cron' : 'on_demand'
}

/** Normalizes a candidate_profiles row + answers into CandidateData. */
function toCandidateData(
  profile: Record<string, unknown> | null,
  answers: Array<{ question_key: string; answer: string }>,
  eeo: Record<string, string>,
): CandidateData {
  const p = profile ?? {}
  const answerMap: Record<string, string> = {}
  for (const a of answers) {
    if (a.question_key && typeof a.answer === 'string') answerMap[a.question_key] = a.answer
  }
  return {
    fullName: asStr(p.full_name),
    preferredName: asStr(p.preferred_name),
    email: asStr(p.email),
    phone: asStr(p.phone),
    phoneCountry: asStr(p.phone_country),
    linkedin: asStr(p.linkedin_url),
    website: asStr(p.website_url),
    location: asStr(p.location),
    state: asStr(p.state),
    workAuthorization: asStr(p.work_authorization),
    requiresSponsorship: typeof p.requires_sponsorship === 'boolean' ? p.requires_sponsorship : undefined,
    securityClearance: asStr(p.security_clearance),
    employmentHistory: p.employment_history,
    eeo,
    answers: answerMap,
  }
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined
}

/**
 * Maps the eeo_disclosures jsonb into the canonical eeo_* keys the field mapper
 * reads. Accepts both already-canonical keys and the legacy payload key names.
 */
function normalizeEeo(disclosures: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!disclosures || typeof disclosures !== 'object') return out
  const src = disclosures as Record<string, unknown>
  const alias: Record<string, string> = {
    gender: 'eeo_gender',
    eeo_gender: 'eeo_gender',
    race: 'eeo_race',
    race_ethnicity: 'eeo_race',
    eeo_race: 'eeo_race',
    hispanic_latino: 'eeo_hispanic_latino',
    eeo_hispanic_latino: 'eeo_hispanic_latino',
    veteran_status: 'eeo_veteran',
    eeo_veteran: 'eeo_veteran',
    disability_status: 'eeo_disability',
    eeo_disability: 'eeo_disability',
  }
  for (const [k, v] of Object.entries(src)) {
    const dest = alias[k]
    if (dest && typeof v === 'string' && v.trim()) out[dest] = v
  }
  return out
}

/** Serializable per-field summary returned to the caller (no raw values leaked). */
function fieldSummary(fields: MappedField[]) {
  return fields.map((f) => ({
    field_key: f.fieldKey,
    field_type: f.fieldType,
    value_source: f.valueSource,
    confidence: f.confidence,
    is_sensitive: f.isSensitive,
    review_gate: f.reviewGate,
  }))
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body', code: 'bad_request' }, 400, req)
  }

  const jobUrl = body.job?.url
  if (!jobUrl || typeof jobUrl !== 'string') {
    return json({ error: 'job.url is required', code: 'bad_request' }, 400, req)
  }

  const preparedBy = coercePreparedBy(body.prepared_by)
  const mode = coerceMode(body.mode)
  const matchScore = typeof body.match_score === 'number' ? body.match_score : null

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Server not configured', code: 'config' }, 500, req)
  }

  // ── Client construction ────────────────────────────────────────────────
  // On-demand: RLS-scoped to the caller via the forwarded JWT + public anon key
  // (NO service-role — BR-122). The guarded cron branch is a thin scaffold that
  // returns BEFORE any client is built, so the on-demand client stays `const`.
  if (preparedBy === 'cron') {
    // SCAFFOLD ONLY (not the focus): a cron run would use the service-role key
    // and resolve the target user from the job row. Guard so it never runs
    // unless explicitly configured, and require an internal cron secret.
    const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
    const provided = req.headers.get('x-cron-secret') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!cronSecret || provided !== cronSecret || !serviceRoleKey) {
      return json({ error: 'cron prep not enabled', code: 'forbidden' }, 403, req)
    }
    // TODO(phase-cron): batch-prepare auto-eligible jobs for each user with
    // their own resolved user_id; out of scope for this packet.
    return json({ error: 'cron prep not implemented', code: 'not_implemented' }, 501, req)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Unauthorized', code: 'auth' }, 401, req)
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'Unauthorized', code: 'auth' }, 401, req)
  const userId: string = userData.user.id

  // ── 1) Classify the ATS family from the posting URL ────────────────────
  const { family, antibotTier } = detectAtsFamily(jobUrl)

  // ── 2) Resolve the public read endpoint (null for defended families) ───
  const ids = resolveBoardIdentifiers(family, jobUrl)
  const endpoint = ids ? buildReadEndpoint(family, ids) : null

  let rawSchema: unknown = null
  let fields: NormalizedField[] = []
  let readError: string | null = null

  if (endpoint) {
    try {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: { Accept: 'application/json' },
        body: endpoint.body,
      })
      if (!res.ok) {
        readError = `ats_read_http_${res.status}`
      } else {
        rawSchema = await res.json()
        fields = parseForFamily(family, rawSchema)
      }
    } catch (err) {
      readError = err instanceof Error ? err.message : 'ats_read_failed'
    }
  } else {
    // Defended / unsupported family — never headless-read it.
    readError = 'no_public_read_api'
  }

  // ── 3) Load the caller's candidate data (RLS-scoped) ───────────────────
  const { data: profileRow } = await supabase
    .from('candidate_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const { data: answerRows } = await supabase
    .from('application_answers')
    .select('question_key, answer')
    .eq('user_id', userId)

  const eeo = normalizeEeo((profileRow as Record<string, unknown> | null)?.eeo_disclosures)
  const candidate = toCandidateData(
    profileRow as Record<string, unknown> | null,
    (answerRows as Array<{ question_key: string; answer: string }> | null) ?? [],
    eeo,
  )

  // ── 4) Normalize + map + gate ──────────────────────────────────────────
  const externalJobId =
    body.job?.external_job_id ?? (ids ? ids.postingId : null)
  const normalized: NormalizedSchema = {
    atsFamily: family,
    antibotTier,
    sourceUrl: jobUrl,
    externalJobId,
    fields,
    raw: rawSchema,
  }
  const mapped = mapFields(normalized, candidate)
  let decision = decidePrep({
    atsFamily: family,
    antibotTier,
    mode,
    matchScore,
    fields: mapped,
    preparedBy,
  })

  // A schema we could not read cannot be auto-prepared regardless of family.
  if (readError && decision.status === 'prepared') {
    decision = { status: 'needs_review', gatingReason: readError }
  }

  // ── 5) Upsert prepared_applications + replace its fields ────────────────
  const jobId = asStr(body.job?.job_id) ?? null
  const jobRef = {
    source_board: family,
    source_url: jobUrl,
    external_job_id: externalJobId,
    ...(body.job?.title ? { title: body.job.title } : {}),
  }

  const baseRow = {
    user_id: userId,
    job_id: jobId,
    job_ref: jobRef,
    ats_family: family,
    antibot_tier: antibotTier,
    form_schema_snapshot: (rawSchema ?? {}) as Record<string, unknown>,
    match_score: matchScore,
    mode,
    status: decision.status,
    gating_reason: decision.gatingReason,
    document_versions: {},
    prepared_by: preparedBy,
  }

  let preparedId: string | null = null
  if (jobId) {
    const { data: upserted, error: upsertErr } = await supabase
      .from('prepared_applications')
      .upsert(baseRow, { onConflict: 'user_id,job_id' })
      .select('id')
      .single()
    if (upsertErr || !upserted) {
      return json({ error: 'Failed to persist prepared application', code: 'db_write' }, 500, req)
    }
    preparedId = (upserted as { id: string }).id
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('prepared_applications')
      .insert(baseRow)
      .select('id')
      .single()
    if (insertErr || !inserted) {
      return json({ error: 'Failed to persist prepared application', code: 'db_write' }, 500, req)
    }
    preparedId = (inserted as { id: string }).id
  }

  // Replace child rows: delete the prior set, then insert the fresh mapping.
  await supabase.from('prepared_application_fields').delete().eq('prepared_application_id', preparedId)

  if (mapped.length > 0) {
    const fieldRows = mapped.map((f) => ({
      prepared_application_id: preparedId,
      user_id: userId,
      field_key: f.fieldKey,
      field_label: f.fieldLabel,
      field_type: f.fieldType,
      // mapped_value is jsonb — wrap scalars so null stays distinguishable.
      mapped_value: f.mappedValue === null ? null : (f.mappedValue as unknown),
      value_source: f.valueSource,
      confidence: f.confidence,
      is_sensitive: f.isSensitive,
      // The DB trigger (BR-156) will force review_gate=true for sensitive fields.
      review_gate: f.reviewGate,
      free_text_draft: f.freeTextDraft,
      redaction_safe: f.redactionSafe,
    }))
    const { error: fieldsErr } = await supabase.from('prepared_application_fields').insert(fieldRows)
    if (fieldsErr) {
      return json({ error: 'Failed to persist prepared fields', code: 'db_write' }, 500, req)
    }
  }

  return json(
    {
      prepared_application_id: preparedId,
      status: decision.status,
      gating_reason: decision.gatingReason,
      fields: fieldSummary(mapped),
    },
    200,
    req,
  )
})
