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
import { getApiKeyForProvider, isProviderId } from '../_shared/llm/factory.ts'
import { LlmError, clientMessageForCode, httpStatusForCode } from '../_shared/llm/errors.ts'
import { JD_FORMAT_MAX_TOKENS, formatJdMarkdown } from '../_shared/jd-format.ts'

interface RequestBody {
  provider?: string
  model?: string
  description?: unknown
  maxTokens?: number
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

  let result
  try {
    result = await formatJdMarkdown({
      provider: providerId,
      model: typeof body.model === 'string' ? body.model : '',
      apiKey,
      description,
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : JD_FORMAT_MAX_TOKENS,
    })
  } catch (err) {
    if (err instanceof LlmError) {
      return json(
        { error: clientMessageForCode(err.code, err.provider), code: err.code, provider: err.provider },
        httpStatusForCode(err.code),
      )
    }
    return json({ error: 'Unexpected server error', code: 'unknown', provider: providerId }, 500)
  }

  const markdown = result.markdown
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
