/**
 * ai-chat — Edge Function (multi-provider)
 *
 * Server-side bridge to the configured LLM providers (Anthropic / OpenAI /
 * Google Gemini) for the conversational assistant. The browser never holds a
 * provider key — keys are project-level Supabase secrets read via Deno.env.
 *
 * Non-negotiables enforced here:
 * - Provider keys accessed only via the factory (Deno.env); never shipped in the
 *   client bundle (ADR-005).
 * - Caller identity verified via the forwarded Supabase JWT before any model call.
 *
 * Contract:
 *   POST { provider?: 'anthropic'|'openai'|'google', model: string,
 *          system: string, messages: { role:'user'|'assistant', content }[],
 *          maxTokens?: number }
 *   →    { text, usage: { input_tokens, output_tokens } }
 *   err  { error, code, provider }   (normalized; see _shared/llm/errors.ts)
 *
 * Cost gating + usage logging happen in the caller (chatCompletionService via
 * src/lib/ai-router.ts), so this function stays thin.
 */
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { getApiKeyForProvider, getProvider, isProviderId } from '../_shared/llm/factory.ts'
import { LlmError, clientMessageForCode, httpStatusForCode } from '../_shared/llm/errors.ts'
import type { ChatTurn } from '../_shared/llm/types.ts'

const DEFAULT_MAX_TOKENS = 1024

interface RequestBody {
  provider?: string
  model?: string
  system?: string
  messages?: ChatTurn[]
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

  // Default to anthropic for backward compatibility with the prior contract.
  const providerId = isProviderId(body.provider) ? body.provider : 'anthropic'

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) return json({ error: 'messages required' }, 400)

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
        system: body.system ?? '',
        messages,
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : DEFAULT_MAX_TOKENS,
      },
      apiKey,
    )
    return json(result, 200)
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
