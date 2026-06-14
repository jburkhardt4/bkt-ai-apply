/**
 * score-job-fit — Edge Function (multi-provider)
 *
 * Server-side bridge to the routed LLM for the `match_scoring` task. Produces a
 * structured job-fit score (RAG + structured analysis). The browser never holds
 * a provider key — keys are project-level Supabase secrets read via Deno.env.
 *
 * Mirrors ai-chat exactly: JWT-gated, CORS + OPTIONS from _shared/http, JSON
 * body, provider/model routed through _shared/llm/factory, normalized errors.
 * The function is THIN: NO database writes, NO service-role key. The model name
 * and provider are PASSED IN from the client (which read them from
 * src/lib/ai-router.ts ROUTING_MATRIX.match_scoring) — never hardcoded here.
 *
 * Cost gating, persistence, and usage logging happen in the caller (via
 * src/lib/ai-router.ts), so this function stays thin.
 *
 * Recommendation thresholds (BR-020 consider>=60 / BR-021 apply>=80 /
 * BR-022 reject<60) are the CLIENT's authoritative mapping. The function passes
 * through the model's recommendation; it hardcodes no threshold literals.
 *
 * Contract:
 *   POST { provider?: 'anthropic'|'openai'|'google', model: string,
 *          job: unknown, profile: unknown, system?: string, maxTokens?: number }
 *   →    { score: { overall_score, skills_score, domain_score, seniority_score,
 *                   tools_score, location_auth_score, recommendation,
 *                   strengths, gaps, reasoning_trace },
 *          usage: { input_tokens, output_tokens } }
 *   err  { error, code, provider }   (normalized; see _shared/llm/errors.ts)
 */
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { getApiKeyForProvider, getProvider, isProviderId } from '../_shared/llm/factory.ts'
import { LlmError, clientMessageForCode, httpStatusForCode } from '../_shared/llm/errors.ts'

const DEFAULT_MAX_TOKENS = 1536

interface RequestBody {
  provider?: string
  model?: string
  job?: unknown
  profile?: unknown
  system?: string
  maxTokens?: number
}

type Recommendation = 'apply' | 'consider' | 'reject'

interface JobFitScore {
  overall_score: number
  skills_score: number
  domain_score: number
  seniority_score: number
  tools_score: number
  location_auth_score: number
  recommendation: Recommendation
  strengths: string[]
  gaps: string[]
  reasoning_trace: Record<string, unknown>
}

// Default instruction set used when the client does not pass an explicit system
// prompt. Instructs strict-JSON output so the response is machine-parseable.
const DEFAULT_SYSTEM_PROMPT = [
  'You are a job-fit scoring engine for an automated job-application pipeline.',
  'Compare the candidate profile against the job posting and score the fit.',
  'Reply with a single JSON object and NOTHING else (no prose, no code fences):',
  '{',
  '  "overall_score": <integer 0-100>,',
  '  "skills_score": <integer 0-100>,',
  '  "domain_score": <integer 0-100>,',
  '  "seniority_score": <integer 0-100>,',
  '  "tools_score": <integer 0-100>,',
  '  "location_auth_score": <integer 0-100>,',
  '  "recommendation": "apply" | "consider" | "reject",',
  '  "strengths": [<string>, ...],',
  '  "gaps": [<string>, ...],',
  '  "reasoning_trace": { <free-form object explaining each sub-score> }',
  '}',
  'Every *_score is an integer from 0 (no match) to 100 (perfect match).',
  'skills_score = required hard/soft skills overlap; domain_score = industry/domain',
  'relevance; seniority_score = level/title alignment; tools_score = specific',
  'tools/tech-stack overlap; location_auth_score = location, remote, and work-',
  'authorization fit. overall_score is your holistic judgement, not a fixed',
  'formula. strengths and gaps are short bullet phrases. reasoning_trace records',
  'why you assigned each sub-score. Base every judgement only on the provided',
  'job and profile; never invent facts.',
].join('\n')

function buildUserMessage(job: unknown, profile: unknown): string {
  return [
    'JOB POSTING (context):',
    safeStringify(job),
    '',
    'CANDIDATE MASTER PROFILE (context):',
    safeStringify(profile),
  ].join('\n')
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return String(value)
  }
}

/** Strips a ```json … ``` (or bare ```) fence if the model wrapped its output. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function clampInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function toRecommendation(value: unknown): Recommendation | null {
  return value === 'apply' || value === 'consider' || value === 'reject' ? value : null
}

/**
 * Parses the model output into a validated JobFitScore. Handles code-fenced
 * JSON and surrounding prose; returns null on any structural failure so the
 * caller can emit a normalized error instead of leaking a half-formed score.
 */
function parseJobFitScore(text: string): JobFitScore | null {
  const unfenced = stripCodeFence(text)
  const jsonMatch = unfenced.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const r = parsed as Record<string, unknown>

  const overall = clampInt(r.overall_score)
  const skills = clampInt(r.skills_score)
  const domain = clampInt(r.domain_score)
  const seniority = clampInt(r.seniority_score)
  const tools = clampInt(r.tools_score)
  const locationAuth = clampInt(r.location_auth_score)
  const recommendation = toRecommendation(r.recommendation)

  if (
    overall === null ||
    skills === null ||
    domain === null ||
    seniority === null ||
    tools === null ||
    locationAuth === null ||
    recommendation === null
  ) {
    return null
  }

  const reasoningTrace =
    typeof r.reasoning_trace === 'object' && r.reasoning_trace !== null
      ? (r.reasoning_trace as Record<string, unknown>)
      : {}

  return {
    overall_score: overall,
    skills_score: skills,
    domain_score: domain,
    seniority_score: seniority,
    tools_score: tools,
    location_auth_score: locationAuth,
    recommendation,
    strengths: toStringArray(r.strengths),
    gaps: toStringArray(r.gaps),
    reasoning_trace: reasoningTrace,
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Verify the caller is an authenticated user before any model call.
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Provider is routing-driven (client passes match_scoring's provider). Default
  // to anthropic to mirror ai-chat's backward-compatible fallback.
  const providerId = isProviderId(body.provider) ? body.provider : 'anthropic'

  if (body.job === undefined || body.profile === undefined) {
    return json({ error: 'job and profile are required' }, 400)
  }

  const apiKey = getApiKeyForProvider(providerId)
  if (!apiKey) {
    return json(
      { error: clientMessageForCode('auth', providerId), code: 'auth', provider: providerId },
      502,
    )
  }

  const provider = getProvider(providerId)
  let result
  try {
    result = await provider.complete(
      {
        model: typeof body.model === 'string' ? body.model : '',
        system: typeof body.system === 'string' && body.system.length > 0 ? body.system : DEFAULT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(body.job, body.profile) }],
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : DEFAULT_MAX_TOKENS,
      },
      apiKey,
    )
  } catch (err) {
    if (err instanceof LlmError) {
      return json(
        { error: clientMessageForCode(err.code, err.provider), code: err.code, provider: err.provider },
        httpStatusForCode(err.code),
      )
    }
    return json({ error: 'Unexpected server error', code: 'unknown', provider: providerId }, 500)
  }

  const score = parseJobFitScore(result.text)
  if (!score) {
    // The model returned text we could not validate as a job-fit score. This is
    // an unexpected upstream output rather than a malformed caller request, so
    // surface it as 'unknown' (not 'bad_request').
    return json(
      {
        error: clientMessageForCode('unknown', providerId),
        code: 'unknown',
        provider: providerId,
      },
      httpStatusForCode('unknown'),
    )
  }

  return json({ score, usage: result.usage }, 200)
})
