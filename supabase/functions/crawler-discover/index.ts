/**
 * crawler-discover — Edge Function (ADR-015, Phase 3)
 *
 * Refreshes the ats_boards registry, then enqueues list_sync work:
 *   1. Upsert curated SEED_BOARDS (do-nothing on conflict — never clobbers
 *      a board's sync state).
 *   2. Harvest board tokens from existing jobs.source_url rows (the prospector
 *      already ingests real Greenhouse/Ashby URLs) via the pure extractBoardRef.
 *   3. requeue_stale_crawl_jobs — return crashed/timed-out 'running' leases to
 *      'pending' so a dead lease never permanently suppresses a board.
 *   4. enqueue_due_crawl_jobs — one list_sync per active, stale board with no
 *      open job. crawler-worker drains the queue.
 *
 * Invoked by pg_cron via net.http_post (daily). CRON_SECRET gates the endpoint
 * when set. Service-role client only. Never imported by vitest (Deno-only).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { cronSecretConfigured, hasValidCronSecret } from '../_shared/cron-auth.ts'
import { antibotTierForFamily } from '../_shared/prep/atsFamily.ts'
import { extractBoardRef } from '../_shared/crawl/discovery.ts'
import { SEED_BOARDS } from '../_shared/crawl/seeds.ts'

const HARVEST_LIMIT = 2000
const ENQUEUE_MAX = 200

async function isCronAuthorized(req: Request): Promise<boolean> {
  if (await hasValidCronSecret(req)) return true
  if (!cronSecretConfigured()) {
    console.warn('crawler-discover: SECURITY — CRON_SECRET unset; allowing invocation. Set it to require auth.')
    return true
  }
  return false
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('crawler-discover: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function runDiscover(supabase: SupabaseClient) {
  // 1) Curated seeds — insert-only (do not clobber existing sync state).
  let seeded = 0
  if (SEED_BOARDS.length) {
    const rows = SEED_BOARDS.map((s) => ({
      ats_family: s.ats_family,
      board_token: s.board_token,
      display_name: s.display_name ?? null,
      antibot_tier: antibotTierForFamily(s.ats_family),
      discovered_via: 'seed',
    }))
    const { error } = await supabase
      .from('ats_boards')
      .upsert(rows, { onConflict: 'ats_family,board_token', ignoreDuplicates: true })
    if (error) throw new Error(`seed upsert: ${error.message}`)
    seeded = rows.length
  }

  // 2) Harvest real board tokens from existing job source URLs. Pull the job's
  // company so the harvested board keeps a display_name + company_id — the crawl
  // adapters populate job_postings.company_name from board.display_name, so a
  // label-less board would strip company names out of the company-weighted FTS.
  const { data: jobRows, error: jErr } = await supabase
    .from('jobs')
    .select('source_url, company_id, companies(name)')
    .not('source_url', 'is', null)
    .limit(HARVEST_LIMIT)
  if (jErr) throw new Error(`jobs read: ${jErr.message}`)

  interface HarvestedBoard {
    ats_family: 'greenhouse' | 'lever' | 'ashby'
    board_token: string
    company_id: string | null
    display_name: string | null
  }
  const found = new Map<string, HarvestedBoard>()
  for (const r of jobRows ?? []) {
    const row = r as { source_url: string; company_id: string | null; companies: { name?: string } | { name?: string }[] | null }
    const ref = extractBoardRef(row.source_url)
    if (!ref) continue
    const key = `${ref.ats_family}:${ref.board_token}`
    if (found.has(key)) continue // first job's company label wins
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
    found.set(key, { ...ref, company_id: row.company_id ?? null, display_name: company?.name ?? null })
  }

  let harvested = 0
  if (found.size) {
    const rows = [...found.values()].map((b) => ({
      ats_family: b.ats_family,
      board_token: b.board_token,
      display_name: b.display_name,
      company_id: b.company_id,
      antibot_tier: antibotTierForFamily(b.ats_family),
      discovered_via: 'serpapi',
    }))
    const { error } = await supabase
      .from('ats_boards')
      .upsert(rows, { onConflict: 'ats_family,board_token', ignoreDuplicates: true })
    if (error) throw new Error(`harvest upsert: ${error.message}`)
    harvested = rows.length
  }

  // 3) Self-heal: return crawl_jobs stuck in 'running' past their lease (a crashed
  // or timed-out worker) to 'pending' BEFORE enqueueing. Otherwise enqueue's
  // "no open (pending/running) job" guard would treat the dead lease as live work
  // and the board would stay permanently ineligible for future crawls.
  const { data: requeued, error: rErr } = await supabase.rpc('requeue_stale_crawl_jobs')
  if (rErr) throw new Error(`requeue_stale_crawl_jobs: ${rErr.message}`)

  // 4) Enqueue list_sync for due boards.
  const { data: enqueued, error: eErr } = await supabase.rpc('enqueue_due_crawl_jobs', { p_max: ENQUEUE_MAX })
  if (eErr) throw new Error(`enqueue_due_crawl_jobs: ${eErr.message}`)

  return { seeded, candidateBoards: found.size, harvested, requeued: requeued ?? 0, enqueued: enqueued ?? 0 }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (!(await isCronAuthorized(req))) return json({ error: 'unauthorized' }, 401)

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    console.error(`crawler-discover: ${err instanceof Error ? err.message : 'setup error'}`)
    return json({ error: 'crawler-discover is not configured' }, 500)
  }

  try {
    const result = await runDiscover(supabase)
    console.log(
      `crawler-discover: seeded=${result.seeded}, candidates=${result.candidateBoards}, enqueued=${result.enqueued}`,
    )
    return json(result, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    console.error(`crawler-discover: ${msg}`)
    return json({ error: msg }, 500)
  }
})
