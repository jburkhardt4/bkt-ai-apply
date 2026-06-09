/**
 * provider-status — Edge Function
 *
 * Reports which LLM providers have a project-level key configured, as booleans
 * only. NEVER returns key material. Drives the Integrations status UI and the
 * model-selector enable/disable logic, since the browser cannot read Deno.env.
 *
 * Contract:
 *   POST (no body) → { anthropic: boolean, openai: boolean, google: boolean }
 *
 * Auth: requires a valid Supabase JWT (authenticated users only).
 */
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { PROVIDER_IDS, isProviderConfigured } from '../_shared/llm/factory.ts'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const userId = await getAuthenticatedUserId(req)
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  const status: Record<string, boolean> = {}
  for (const id of PROVIDER_IDS) {
    status[id] = isProviderConfigured(id)
  }
  return json(status, 200)
})
