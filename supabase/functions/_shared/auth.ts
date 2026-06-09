/**
 * Shared caller-identity check for Edge Functions.
 *
 * Verifies the forwarded Supabase JWT and returns the authenticated user id, or
 * null when the request is unauthenticated. Callers translate null into a 401.
 * Keeps every function's auth boundary identical (INT-RULE-006 analogue).
 */
// @ts-expect-error — esm.sh URL import; resolved by the Deno runtime, not Node TS
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!authHeader || !supabaseUrl || !anonKey) return null

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}
