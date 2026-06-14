/**
 * generate-document — Edge Function (multi-provider)
 *
 * Server-side bridge to the routed LLM for document generation:
 *   - documentType 'cover_letter' → routed to anthropic Opus (cover_letter_generation)
 *   - documentType 'resume'       → routed to openai GPT-5 (resume_rewriting)
 * The provider and model are PASSED IN from the client (which read them from
 * src/lib/ai-router.ts ROUTING_MATRIX) — never hardcoded here. The browser never
 * holds a provider key — keys are project-level Supabase secrets read via Deno.env.
 *
 * Mirrors ai-chat exactly: JWT-gated, CORS + OPTIONS from _shared/http, JSON
 * body, provider/model routed through _shared/llm/factory, normalized errors.
 * The function is THIN: NO database writes, NO service-role key. Persistence and
 * usage logging happen in the caller (via src/lib/ai-router.ts).
 *
 * Contract:
 *   POST { provider?: 'anthropic'|'openai'|'google', model: string,
 *          documentType: 'resume'|'cover_letter',
 *          job: unknown, masterProfile: unknown, currentContent?: string,
 *          system?: string, maxTokens?: number }
 *   →    { content: string, usage: { input_tokens, output_tokens } }
 *   err  { error, code, provider }   (normalized; see _shared/llm/errors.ts)
 */
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { getApiKeyForProvider, getProvider, isProviderId } from '../_shared/llm/factory.ts'
import { LlmError, clientMessageForCode, httpStatusForCode } from '../_shared/llm/errors.ts'

const DEFAULT_MAX_TOKENS = 2048

type DocumentType = 'resume' | 'cover_letter'

interface RequestBody {
  provider?: string
  model?: string
  documentType?: string
  job?: unknown
  masterProfile?: unknown
  currentContent?: string
  system?: string
  maxTokens?: number
}

function isDocumentType(value: unknown): value is DocumentType {
  return value === 'resume' || value === 'cover_letter'
}

// Default per-type instruction sets, used when the client does not pass its own
// system prompt. Both ask for the final document text only (no commentary) so
// the response `content` is ready to store/render verbatim.
const COVER_LETTER_SYSTEM_PROMPT = [
  'You are an expert cover-letter writer for a job-application pipeline.',
  'Write a tailored, compelling cover letter for the candidate and the specific',
  'role described. Ground every claim in the candidate master profile; never',
  'invent experience, employers, or credentials. Match the tone to the company',
  'and seniority. Keep it concise (3-5 short paragraphs).',
  'Return ONLY the finished cover-letter text — no preamble, no notes, no code',
  'fences, no placeholders like [Your Name] unless the profile lacks the value.',
].join('\n')

const RESUME_SYSTEM_PROMPT = [
  'You are an expert resume writer and ATS-optimization specialist for a job-',
  'application pipeline. Rewrite/tailor the candidate resume for the specific',
  'role, surfacing the most relevant experience and weaving in the job posting',
  "keywords naturally. Ground every line in the candidate master profile; never",
  'fabricate roles, dates, metrics, or skills. Prefer strong action verbs and',
  'quantified impact where the profile supports it.',
  'Return ONLY the finished resume text — no preamble, no notes, no code fences.',
].join('\n')

function systemPromptFor(documentType: DocumentType): string {
  return documentType === 'cover_letter' ? COVER_LETTER_SYSTEM_PROMPT : RESUME_SYSTEM_PROMPT
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return String(value)
  }
}

function buildUserMessage(
  documentType: DocumentType,
  job: unknown,
  masterProfile: unknown,
  currentContent?: string,
): string {
  const noun = documentType === 'cover_letter' ? 'cover letter' : 'resume'
  const parts = [
    `Produce a ${noun} for the following role using the candidate master profile.`,
    '',
    'JOB POSTING (context):',
    safeStringify(job),
    '',
    'CANDIDATE MASTER PROFILE (context):',
    safeStringify(masterProfile),
  ]
  if (typeof currentContent === 'string' && currentContent.trim().length > 0) {
    parts.push('', `CURRENT ${noun.toUpperCase()} (revise/improve this draft):`, currentContent)
  }
  return parts.join('\n')
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

  if (!isDocumentType(body.documentType)) {
    return json({ error: "documentType must be 'resume' or 'cover_letter'" }, 400)
  }
  if (body.job === undefined || body.masterProfile === undefined) {
    return json({ error: 'job and masterProfile are required' }, 400)
  }
  const documentType = body.documentType

  // Provider is routing-driven (client passes the routed provider:
  // cover_letter_generation → anthropic, resume_rewriting → openai). Default to
  // anthropic to mirror ai-chat's backward-compatible fallback.
  const providerId = isProviderId(body.provider) ? body.provider : 'anthropic'

  const apiKey = getApiKeyForProvider(providerId)
  if (!apiKey) {
    return json(
      { error: clientMessageForCode('auth', providerId), code: 'auth', provider: providerId },
      502,
    )
  }

  const provider = getProvider(providerId)
  try {
    const result = await provider.complete(
      {
        model: typeof body.model === 'string' ? body.model : '',
        system:
          typeof body.system === 'string' && body.system.length > 0
            ? body.system
            : systemPromptFor(documentType),
        messages: [
          {
            role: 'user',
            content: buildUserMessage(documentType, body.job, body.masterProfile, body.currentContent),
          },
        ],
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : DEFAULT_MAX_TOKENS,
      },
      apiKey,
    )
    return json({ content: result.text, usage: result.usage }, 200)
  } catch (err) {
    if (err instanceof LlmError) {
      return json(
        { error: clientMessageForCode(err.code, err.provider), code: err.code, provider: err.provider },
        httpStatusForCode(err.code),
      )
    }
    return json({ error: 'Unexpected server error', code: 'unknown', provider: providerId }, 500)
  }
})
