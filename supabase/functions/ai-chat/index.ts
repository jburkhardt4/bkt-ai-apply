/**
 * ai-chat — Edge Function
 *
 * Server-side bridge to the Anthropic Messages API for the conversational
 * assistant. The browser never holds the model key.
 *
 * Non-negotiables enforced here:
 * - BR-006 analogue / INT-RULE-006: ANTHROPIC_API_KEY accessed only via Deno.env;
 *   never shipped in the client bundle.
 * - Caller identity is verified via the forwarded Supabase JWT (authenticated
 *   users only) before any model call is made.
 *
 * Contract:
 *   POST { model: string (ai-router display name), system: string,
 *          messages: { role: 'user'|'assistant', content: string }[],
 *          maxTokens?: number }
 *   →    { text: string, usage: { input_tokens, output_tokens } }
 *
 * Cost gating + usage logging happen in the caller (chatCompletionService via
 * src/lib/ai-router.ts), so this function stays thin.
 */

// @ts-expect-error — esm.sh URL import; resolved by Deno runtime, not Node TS server
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Map ai-router pinned display names → Anthropic API model IDs. Only anthropic
// task types route here (general_qa → "Claude Sonnet 4.6"). The pinned "Opus 4.6"
// name predates the current Opus id and resolves to the latest available Opus.
const MODEL_ID_BY_NAME: Record<string, string> = {
  'Claude Sonnet 4.6': 'claude-sonnet-4-6',
  'Claude Opus 4.6': 'claude-opus-4-8',
  'Claude Opus 4.8': 'claude-opus-4-8',
}
const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  model?: string
  system?: string
  messages?: ChatTurn[]
  maxTokens?: number
}

interface AnthropicContentBlock {
  type?: string
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Verify caller is an authenticated user (RLS identity) before any model call.
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!authHeader || !supabaseUrl || !anonKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return json({ error: 'messages required' }, 400)
  }

  const modelId = (body.model && MODEL_ID_BY_NAME[body.model]) || DEFAULT_MODEL_ID
  const maxTokens = typeof body.maxTokens === 'number' ? body.maxTokens : 1024

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      system: body.system ?? '',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text()
    return json({ error: `Anthropic error ${anthropicRes.status}: ${detail}` }, 502)
  }

  const payload = (await anthropicRes.json()) as AnthropicResponse
  const text = Array.isArray(payload.content)
    ? payload.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
    : ''

  return json(
    {
      text,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
      },
    },
    200,
  )
})
