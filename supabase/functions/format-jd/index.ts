/**
 * format-jd — Edge Function (multi-provider, JD normalization)
 *
 * Server-side bridge to the routed LLM for the `jd_formatting` task. Takes a
 * raw, messy scraped job description and returns a clean, uniform Markdown
 * version for the Prospector JD sidebar. The browser never holds a provider
 * key — keys are project-level Supabase secrets read via Deno.env.
 *
 * Mirrors ai-chat / score-job-fit exactly: JWT-gated, CORS + OPTIONS from
 * _shared/http, JSON body, provider/model routed through _shared/llm/factory,
 * normalized errors. The function is THIN: NO database writes, NO service-role
 * key. The model name and provider are PASSED IN from the client (which read
 * them from src/lib/ai-router.ts ROUTING_MATRIX.jd_formatting) — never
 * hardcoded here.
 *
 * Cost gating and usage logging happen in the caller (jdFormattingService via
 * src/lib/ai-router.ts), so this function stays thin.
 *
 * Contract:
 *   POST { provider?: 'anthropic'|'openai'|'google', model: string,
 *          description: string, system?: string, maxTokens?: number }
 *   →    { markdown: string, usage: { input_tokens, output_tokens } }
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
  description?: unknown
  system?: string
  maxTokens?: number
}

// The exact JD-normalization instruction set. Used when the client does not
// pass an explicit system prompt. Kept verbatim so formatting stays uniform
// regardless of the originating job board (BR: omnichannel JD consistency).
const DEFAULT_SYSTEM_PROMPT = [
  'You are a precise parsing assistant for a professional job board. Your task is to take raw, messy job descriptions and instantly output a cleanly formatted Markdown version.',
  'Rules:',
  "1. Use standard Markdown headers (`###`) for core sections: 'About the Role', 'Key Responsibilities', and 'Requirements/Qualifications'.",
  '2. Convert all lists to standard bullet points (`*`).',
  '3. Strip out excessive company promotional fluff, equal opportunity boilerplate, and unreadable line breaks.',
  '4. Output ONLY the formatted Markdown. No preamble.',
].join('\n')

/** Strips a ```markdown … ``` (or bare ```) fence if the model wrapped output. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
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

  // Provider is routing-driven (client passes jd_formatting's provider). Default
  // to anthropic to mirror ai-chat's backward-compatible fallback.
  const providerId = isProviderId(body.provider) ? body.provider : 'anthropic'

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length === 0) {
    return json({ error: 'description is required' }, 400)
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
        system:
          typeof body.system === 'string' && body.system.length > 0
            ? body.system
            : DEFAULT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
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

  const markdown = stripCodeFence(result.text)
  if (markdown.length === 0) {
    // The model returned empty/whitespace output — surface as 'unknown' so the
    // caller can fall back to the raw description rather than render a blank panel.
    return json(
      { error: clientMessageForCode('unknown', providerId), code: 'unknown', provider: providerId },
      httpStatusForCode('unknown'),
    )
  }

  return json({ markdown, usage: result.usage }, 200)
})
