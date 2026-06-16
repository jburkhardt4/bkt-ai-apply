/** Shared HTTP helpers for Edge Functions (CORS + JSON responses). */

/**
 * Allow-listed CORS. Set `ALLOWED_ORIGINS` (comma-separated app origins) in the
 * function environment to restrict cross-origin access; the request's `Origin`
 * is echoed when it matches the allow-list, otherwise the first allow-listed
 * origin is returned (browsers block the mismatched caller). When
 * `ALLOWED_ORIGINS` is UNSET the header falls back to `*`, preserving the prior
 * behavior until an operator opts in — so this is a zero-regression default.
 */
const ALLOWED_ORIGINS = ((typeof Deno !== 'undefined' ? Deno.env.get('ALLOWED_ORIGINS') : '') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const BASE_CORS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

/** CORS headers for a response; echoes an allow-listed Origin when configured. */
export function corsHeaders(req?: Request): Record<string, string> {
  const headers = { ...BASE_CORS }
  if (ALLOWED_ORIGINS.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*'
    return headers
  }
  const origin = req?.headers.get('Origin') ?? null
  headers['Access-Control-Allow-Origin'] =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return headers
}

/**
 * Back-compat static headers (no per-request Origin echo). Resolves to `*` when
 * `ALLOWED_ORIGINS` is unset, or the primary allow-listed origin when set.
 */
export const CORS_HEADERS: Record<string, string> = corsHeaders()

/** CORS preflight response that echoes an allow-listed Origin when configured. */
export function preflight(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}

export function json(body: unknown, status: number, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json' },
  })
}
