/**
 * rescore-stale.ts — one-off reconciliation: re-score jobs whose LATEST ai_scores
 * row is an `edge_function_error` heuristic fallback (left behind while the
 * match_scoring route was pointed at a stale/unhealthy model).
 *
 * For each affected job it calls the `score-job-fit` Edge Function with the
 * standardized Anthropic route (Claude Sonnet 4.6) and INSERTS a NEW ai_scores
 * row. The new row is latest-by-`scored_at`, so it supersedes the stale fallback
 * WITHOUT deleting any history. It also refreshes applications.match_score.
 *
 * PROFILE SOURCE: imports `masterProfile` from
 * src/features/applications/data/masterProfile.ts. That module is import-safe
 * under Node/tsx — it imports only `type { CandidateProfile }` (erased at
 * runtime) and references no `import.meta.env` or DOM. So the script uses the
 * same representative profile the app's heuristic/LLM scoring uses, no DB fetch
 * needed. (If masterProfile ever gains a runtime app import, switch to fetching
 * the user's candidate_profiles row.)
 *
 * REQUIRED ENV VARS (process.env; VITE_-prefixed fallbacks accepted for the
 * Supabase pair):
 *   SUPABASE_URL        (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY   (or VITE_SUPABASE_ANON_KEY)
 *   RESCORE_EMAIL       — the account whose stale jobs are re-scored
 *   RESCORE_PASSWORD    — that account's password
 *
 * RUN:
 *   RESCORE_EMAIL=you@example.com RESCORE_PASSWORD=... \
 *     npx tsx scripts/rescore-stale.ts
 *
 * COST / LOGGING NOTE: this incurs REAL Claude Sonnet 4.6 API spend (one LLM call
 * per stale job). It intentionally does NOT write ai_model_usage rows — this is a
 * manual one-off reconciliation run by the product owner, not part of the metered
 * in-app flow, so it is deliberately excluded from the monthly cost ledger.
 *
 * This script does NOT delete rows and makes no schema changes.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { masterProfile } from '../src/features/applications/data/masterProfile'

/** The standardized Anthropic match_scoring model (mirrors the ai-router pin). */
const RESCORE_MODEL = 'Claude Sonnet 4.6'
const RESCORE_PROVIDER = 'anthropic'
/** Politeness delay between sequential Edge Function calls. */
const CALL_DELAY_MS = 300

interface AiScoreRow {
  job_id: string
  scored_at: string
  reasoning_trace: unknown
}

interface JobRow {
  id: string
  title: string
  source_url: string
  description: string | null
}

interface EdgeJobFitScore {
  overall_score: number
  skills_score: number
  domain_score: number
  seniority_score: number
  tools_score: number
  location_auth_score: number
  recommendation: string
  strengths: string[]
  gaps: string[]
  reasoning_trace: Record<string, unknown>
}

interface EdgeJobFitResponse {
  score: EdgeJobFitScore
  usage: { input_tokens: number; output_tokens: number }
}

function requireEnv(primary: string, fallback?: string): string | undefined {
  return process.env[primary] ?? (fallback ? process.env[fallback] : undefined)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** >=80 apply, >=60 consider, else reject (BR-020/021/022 derivation). */
function deriveRecommendation(overall: number): 'apply' | 'consider' | 'reject' {
  if (overall >= 80) return 'apply'
  if (overall >= 60) return 'consider'
  return 'reject'
}

/** Reads the normalized `{ code }` from a FunctionsHttpError's Response body. */
async function readEdgeErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context
  try {
    const body = (await context?.json?.()) as { code?: string } | undefined
    return body?.code ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function reasonOf(trace: unknown): string {
  if (trace && typeof trace === 'object' && !Array.isArray(trace)) {
    const reason = (trace as { reason?: unknown }).reason
    return typeof reason === 'string' ? reason : ''
  }
  return ''
}

/** Latest ai_scores row per job_id, by scored_at (descending wins). */
function latestByJob(rows: AiScoreRow[]): Map<string, AiScoreRow> {
  const latest = new Map<string, AiScoreRow>()
  for (const row of rows) {
    const current = latest.get(row.job_id)
    if (!current || row.scored_at > current.scored_at) {
      latest.set(row.job_id, row)
    }
  }
  return latest
}

async function loadStaleJobs(supabase: SupabaseClient, userId: string): Promise<JobRow[]> {
  const { data: scoreRows, error: scoresError } = await supabase
    .from('ai_scores')
    .select('job_id, scored_at, reasoning_trace')
    .eq('user_id', userId)

  if (scoresError) {
    throw new Error(`Failed to load ai_scores: ${scoresError.message}`)
  }

  const latest = latestByJob((scoreRows ?? []) as AiScoreRow[])
  const staleJobIds = [...latest.values()]
    .filter((row) => reasonOf(row.reasoning_trace).startsWith('edge_function_error'))
    .map((row) => row.job_id)

  if (staleJobIds.length === 0) {
    return []
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, title, source_url, description')
    .eq('user_id', userId)
    .in('id', staleJobIds)

  if (jobsError) {
    throw new Error(`Failed to load jobs: ${jobsError.message}`)
  }

  return (jobs ?? []) as JobRow[]
}

async function rescoreJob(
  supabase: SupabaseClient,
  userId: string,
  job: JobRow,
): Promise<{ ok: true; overall: number } | { ok: false; code: string }> {
  const text = job.description || job.title
  const { data, error } = await supabase.functions.invoke<EdgeJobFitResponse>('score-job-fit', {
    body: {
      provider: RESCORE_PROVIDER,
      model: RESCORE_MODEL,
      job: {
        id: job.id,
        title: job.title,
        source_url: job.source_url,
        description: job.description,
        text,
      },
      profile: masterProfile,
    },
  })

  if (error) {
    return { ok: false, code: await readEdgeErrorCode(error) }
  }
  if (!data) {
    return { ok: false, code: 'empty_response' }
  }

  const score = data.score
  const overall = score.overall_score

  // INSERT a NEW row — latest-by-scored_at supersedes the stale fallback; old
  // rows are kept (no delete). reasoning_trace is flagged as a backfill.
  const { error: insertError } = await supabase.from('ai_scores').insert({
    user_id: userId,
    job_id: job.id,
    overall_score: overall,
    skills_score: score.skills_score,
    domain_score: score.domain_score,
    seniority_score: score.seniority_score,
    tools_score: score.tools_score,
    location_auth_score: score.location_auth_score,
    recommendation: deriveRecommendation(overall),
    strengths: score.strengths ?? [],
    gaps: score.gaps ?? [],
    model_used: RESCORE_MODEL,
    reasoning_trace: { ...score.reasoning_trace, source: 'llm', backfill: true },
    scored_at: new Date().toISOString(),
  })

  if (insertError) {
    return { ok: false, code: `insert_failed:${insertError.code ?? insertError.message}` }
  }

  // Refresh the application's match_score if a row exists (ignored otherwise).
  const { error: updateError } = await supabase
    .from('applications')
    .update({ match_score: overall })
    .eq('user_id', userId)
    .eq('job_id', job.id)

  if (updateError) {
    console.warn(`  ! match_score update skipped for ${job.id}: ${updateError.message}`)
  }

  return { ok: true, overall }
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const email = process.env.RESCORE_EMAIL
  const password = process.env.RESCORE_PASSWORD

  const missing: string[] = []
  if (!supabaseUrl) missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)')
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)')
  if (!email) missing.push('RESCORE_EMAIL')
  if (!password) missing.push('RESCORE_PASSWORD')

  if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(', ')}`)
    console.error(
      'Run: RESCORE_EMAIL=you@example.com RESCORE_PASSWORD=... npx tsx scripts/rescore-stale.ts',
    )
    process.exit(1)
  }

  // A fresh client (NOT src/lib/supabase.ts, which reads import.meta.env). RLS +
  // the JWT-gated score-job-fit function require a real signed-in session.
  const supabase = createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: email as string,
    password: password as string,
  })

  if (authError || !auth.user) {
    console.error(`Sign-in failed: ${authError?.message ?? 'no session returned'}`)
    process.exit(1)
  }

  const userId = auth.user.id
  console.log(`Signed in as ${email} (${userId}).`)

  const jobs = await loadStaleJobs(supabase, userId)
  if (jobs.length === 0) {
    console.log('No stale edge_function_error scores to re-score. Nothing to do.')
    await supabase.auth.signOut()
    return
  }

  console.log(`Found ${jobs.length} job(s) with a stale edge_function_error score. Re-scoring...`)

  let rescored = 0
  const failed: Array<{ job_id: string; code: string }> = []

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i]
    console.log(`[${i + 1}/${jobs.length}] ${job.id} — ${job.title}`)
    const result = await rescoreJob(supabase, userId, job)
    if (result.ok) {
      rescored += 1
      console.log(`  ok → overall ${result.overall} (${deriveRecommendation(result.overall)})`)
    } else {
      failed.push({ job_id: job.id, code: result.code })
      console.error(`  failed → ${result.code}`)
    }
    if (i < jobs.length - 1) {
      await delay(CALL_DELAY_MS)
    }
  }

  console.log('\nSummary:')
  console.log(JSON.stringify({ rescored, failed }, null, 2))

  await supabase.auth.signOut()
}

main().catch((err: unknown) => {
  console.error(`rescore-stale failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
