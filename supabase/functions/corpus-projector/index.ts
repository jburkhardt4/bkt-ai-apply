/**
 * corpus-projector — Edge Function (ADR-014 Decision 5, Phase 5)
 *
 * Projects the shared job_postings corpus into per-user jobs: for every active
 * prospecting_profile it calls the service-role RPC project_corpus_all, which
 * FTS-matches the profile's job_titles (filtered by environment + min_salary)
 * and inserts the best matches into that profile owner's user-scoped jobs with
 * source='corpus' (deduped on source_url). The user-scoped jobs table + RLS are
 * untouched; all writes go through the service-role RPC.
 *
 * NOT scheduled by default: it writes into users' jobs tables, so wiring its
 * pg_cron is a deliberate JB step (see docs / handover). Invoke manually or
 * schedule once reviewed. CRON_SECRET gates the endpoint when set. Deno-only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { cronSecretConfigured, hasValidCronSecret } from '../_shared/cron-auth.ts'

const DEFAULT_LIMIT_PER_PROFILE = 25

async function isCronAuthorized(req: Request): Promise<boolean> {
  if (await hasValidCronSecret(req)) return true
  if (!cronSecretConfigured()) {
    console.warn('corpus-projector: SECURITY — CRON_SECRET unset; allowing invocation. Set it to require auth.')
    return true
  }
  return false
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('corpus-projector: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (!(await isCronAuthorized(req))) return json({ error: 'unauthorized' }, 401)

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    console.error(`corpus-projector: ${err instanceof Error ? err.message : 'setup error'}`)
    return json({ error: 'corpus-projector is not configured' }, 500)
  }

  let limit = DEFAULT_LIMIT_PER_PROFILE
  try {
    const body = await req.json()
    if (body && typeof body.limit_per_profile === 'number') {
      limit = Math.max(1, Math.min(100, Math.floor(body.limit_per_profile)))
    }
  } catch {
    // no/!json body — use default
  }

  try {
    const { data, error } = await supabase.rpc('project_corpus_all', { p_limit_per_profile: limit })
    if (error) throw new Error(error.message)
    console.log(`corpus-projector: ${JSON.stringify(data)}`)
    return json(data, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    console.error(`corpus-projector: ${msg}`)
    return json({ error: msg }, 500)
  }
})
