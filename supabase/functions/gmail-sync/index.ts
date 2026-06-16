/**
 * gmail-sync — Edge Function
 *
 * Triggered on schedule (pg_cron → net.http_post, every 15 minutes), mirroring
 * the prospector-cron pattern. Pulls new Gmail messages for JB's account via a
 * stored OAuth refresh token (gmail.readonly), classifies each with Gemini 2.5
 * Flash (keyword fallback), matches it to an application, stores it in the
 * emails table, and auto-transitions the application stage at confidence
 * ≥ 0.70 through the transition_stage RPC.
 *
 * Non-negotiables enforced here:
 * - BR-001: RLS stays on (service role bypasses by design for server ops)
 * - BR-004: every stage change goes through transition_stage → application_events
 * - BR-005: every query scoped to the owning user_id
 * - BR-030/BR-031: 0.70 confidence gate for auto-action
 * - BR-053/BR-054: email classification is a critical task (never cost-blocked);
 *   every model call logs tokens + estimated cost to ai_model_usage
 * - Dedupe: emails UNIQUE(user_id, gmail_message_id); cursor in gmail_sync_state
 *
 * Graceful no-op: when the Google secrets are not yet configured the function
 * returns 200 { status: 'noop' } so the cron stays quiet until setup is done
 * (docs/deploy/gmail-sync-setup.md).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { json, preflight } from '../_shared/http.ts'
import { getApiKeyForProvider, getProvider } from '../_shared/llm/factory.ts'
import { readGmailCredentials, refreshAccessToken } from '../_shared/gmail-auth.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { cronSecretConfigured, hasValidCronSecret } from '../_shared/cron-auth.ts'
import {
  fetchMessageMeta,
  listLabelNames,
  listNewMessageIds,
  MAX_MESSAGES_PER_RUN,
  type GmailMessageMeta,
} from './gmail.ts'
import {
  buildGeminiUserMessage,
  classifyByKeywords,
  estimateGeminiFlashCostUsd,
  isExcludedSender,
  matchApplication,
  parseGeminiClassification,
  resolveAutoAction,
  resolveLabelClassification,
  shouldStoreEmail,
  GEMINI_SYSTEM_PROMPT,
  type ApplicationCandidate,
  type ClassificationDecision,
  type EmailFacts,
  type GmailClassification,
  type LabelMapEntry,
  type MatchResult,
  type PipelineStage,
} from './logic.ts'

const GEMINI_MODEL_NAME = 'Gemini 2.5 Flash'
const GEMINI_MAX_TOKENS = 64
/** Re-invocation guard for the unauthenticated cron endpoint. */
const MIN_SECONDS_BETWEEN_RUNS = 60

interface RunSummary {
  status: 'success' | 'partial' | 'error' | 'noop'
  mode?: 'history' | 'bootstrap'
  fetched: number
  stored: number
  /** Classified by a mapped Gmail label (BR-037) — no Gemini call made. */
  labeled: number
  skipped_irrelevant: number
  auto_transitioned: number
  errors: string[]
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('gmail-sync: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** The refresh token belongs to one Gmail account; resolve its app user +
 *  email (the email drives self-sent digest exclusion). */
async function resolveUser(supabase: SupabaseClient): Promise<{ id: string; email: string }> {
  const configuredEmail = Deno.env.get('GMAIL_USER_EMAIL')
  if (configuredEmail) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', configuredEmail.toLowerCase())
      .maybeSingle()
    if (error) throw new Error(`users lookup failed: ${error.message}`)
    if (!data) throw new Error(`GMAIL_USER_EMAIL ${configuredEmail} has no users row`)
    return { id: data.id, email: data.email }
  }

  const { data, error } = await supabase.from('users').select('id, email').limit(2)
  if (error) throw new Error(`users lookup failed: ${error.message}`)
  if (!data || data.length !== 1) {
    throw new Error(
      `Expected exactly one users row when GMAIL_USER_EMAIL is unset; found ${data?.length ?? 0}`,
    )
  }
  return { id: data[0].id, email: data[0].email }
}

async function loadCandidates(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationCandidate[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, stage, jobs(title, companies(name, domain))')
    .eq('user_id', userId)
  if (error) throw new Error(`applications lookup failed: ${error.message}`)

  interface Row {
    id: string
    stage: string
    jobs: { title: string | null; companies: { name: string | null; domain: string | null } | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    applicationId: row.id,
    stage: row.stage as PipelineStage,
    companyName: row.jobs?.companies?.name ?? null,
    companyDomain: row.jobs?.companies?.domain ?? null,
    jobTitle: row.jobs?.title ?? null,
  }))
}

async function loadLabelMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<LabelMapEntry[]> {
  const { data, error } = await supabase
    .from('gmail_label_map')
    .select('gmail_label, classification, display_label')
    .eq('user_id', userId)
  if (error) throw new Error(`gmail_label_map lookup failed: ${error.message}`)
  return (data ?? []).map((row) => ({
    gmailLabel: row.gmail_label as string,
    classification: row.classification as GmailClassification,
    displayLabel: row.display_label as string,
  }))
}

/** Gemini classification with keyword fallback; logs usage either way (BR-054). */
async function classifyEmail(
  supabase: SupabaseClient,
  userId: string,
  facts: EmailFacts,
): Promise<ClassificationDecision> {
  let decision: ClassificationDecision | null = null
  let tokensIn = 0
  let tokensOut = 0

  const apiKey = getApiKeyForProvider('google')
  if (apiKey) {
    try {
      const provider = getProvider('google')
      const result = await provider.complete(
        {
          model: GEMINI_MODEL_NAME,
          system: GEMINI_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildGeminiUserMessage(facts) }],
          maxTokens: GEMINI_MAX_TOKENS,
          // Classification needs no reasoning; disabling thinking keeps the
          // JSON answer within the small output budget (see google.ts).
          thinkingBudget: 0,
        },
        apiKey,
      )
      tokensIn = result.usage.input_tokens
      tokensOut = result.usage.output_tokens
      decision = parseGeminiClassification(result.text)
      if (!decision) {
        console.warn('gmail-sync: unparseable Gemini reply — falling back to keywords')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`gmail-sync: Gemini call failed — falling back to keywords: ${msg}`)
    }
  }

  const { error } = await supabase.from('ai_model_usage').insert({
    user_id: userId,
    model_provider: 'google',
    model_name: GEMINI_MODEL_NAME,
    task_type: 'email_classification',
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: estimateGeminiFlashCostUsd(tokensIn, tokensOut),
  })
  if (error) console.error(`gmail-sync: ai_model_usage insert failed: ${error.message}`)

  return decision ?? classifyByKeywords(facts)
}

async function transitionViaRpc(
  supabase: SupabaseClient,
  params: {
    applicationId: string
    userId: string
    fromStage: PipelineStage
    toStage: PipelineStage
    classification: string
  },
): Promise<void> {
  const { error } = await supabase.rpc('transition_stage', {
    p_application_id: params.applicationId,
    p_user_id: params.userId,
    p_from_stage: params.fromStage,
    p_to_stage: params.toStage,
    p_reason: `Auto-transition from Gmail classification: ${params.classification}`,
    p_actor: 'gmail_scraper',
  })
  if (error) throw new Error(`Stage transition failed: ${error.message}`)
}

async function processMessage(
  supabase: SupabaseClient,
  userId: string,
  selfEmail: string | null,
  meta: GmailMessageMeta,
  labelNames: string[],
  labelMap: LabelMapEntry[],
  candidates: ApplicationCandidate[],
  summary: RunSummary,
): Promise<void> {
  // Sender-based exclusion runs first: self-sent digests (e.g. the Gemini
  // "Daily Summary" the user emails themselves) quote real job mail and would
  // otherwise be misclassified. Skip before any Gemini call (BR-035).
  if (isExcludedSender(meta.fromAddress, selfEmail)) {
    summary.skipped_irrelevant += 1
    return
  }

  const facts: EmailFacts = {
    fromAddress: meta.fromAddress,
    subject: meta.subject,
    snippet: meta.snippet,
  }

  // BR-037: a mapped Gmail label is authoritative — skip the Gemini call.
  const labelResolution = resolveLabelClassification(labelNames, labelMap)
  const decision = labelResolution?.decision ?? (await classifyEmail(supabase, userId, facts))
  const matched: MatchResult | null = matchApplication(facts, candidates)

  if (!shouldStoreEmail(decision, matched, labelResolution !== null)) {
    summary.skipped_irrelevant += 1
    return
  }
  if (labelResolution) summary.labeled += 1

  const plan = resolveAutoAction(decision, matched)
  let autoActioned = false
  let reason: string

  if (plan.action === 'transition' && matched) {
    await transitionViaRpc(supabase, {
      applicationId: matched.applicationId,
      userId,
      fromStage: matched.stage,
      toStage: plan.toStage,
      classification: decision.classification,
    })
    // Keep the in-memory stage current for later emails in this run.
    matched.stage = plan.toStage
    const candidate = candidates.find((c) => c.applicationId === matched.applicationId)
    if (candidate) candidate.stage = plan.toStage
    autoActioned = true
    reason = `Auto-transitioned to ${plan.toStage}.`
  } else {
    reason = plan.action === 'skip' ? plan.reason : 'No action taken.'
  }

  const { error: emailError } = await supabase.from('emails').insert({
    user_id: userId,
    application_id: matched?.applicationId ?? null,
    gmail_message_id: meta.id,
    thread_id: meta.threadId,
    gmail_labels: labelNames,
    from_address: meta.fromAddress,
    subject: meta.subject,
    body_snippet: meta.snippet,
    classification: decision.classification,
    confidence: decision.confidence,
    auto_actioned: autoActioned,
    received_at: meta.receivedAtIso,
    processed_at: new Date().toISOString(),
  })
  if (emailError) {
    // 23505 = unique violation (already ingested) — benign race, not an error.
    if (emailError.code === '23505') return
    throw new Error(`emails insert failed: ${emailError.message}`)
  }
  summary.stored += 1
  if (autoActioned) summary.auto_transitioned += 1

  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: userId,
    application_id: matched?.applicationId ?? null,
    notification_type: 'ai_signal',
    title: `Email classified: ${decision.classification}`,
    body: `Confidence ${(decision.confidence * 100).toFixed(1)}%. ${reason}`,
  })
  if (notifError) console.error(`gmail-sync: notification insert failed: ${notifError.message}`)
}

async function writeSyncState(
  supabase: SupabaseClient,
  userId: string,
  patch: {
    historyId?: string | null
    status: RunSummary['status']
    error?: string | null
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    last_synced_at: new Date().toISOString(),
    last_status: patch.status,
    last_error: patch.error ?? null,
  }
  if (patch.historyId !== undefined) row.history_id = patch.historyId
  const { error } = await supabase.from('gmail_sync_state').upsert(row, { onConflict: 'user_id' })
  if (error) console.error(`gmail-sync: sync-state upsert failed: ${error.message}`)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflight(req)

  console.log('gmail-sync: invoked')

  // Caller authentication: pg_cron presents CRON_SECRET; the client Refresh
  // button presents a Supabase JWT. The function is deployed --no-verify-jwt,
  // so reject anonymous callers once a secret is configured (BR-005). The 60s
  // re-invocation guard below is a throttle, not an authorization control.
  const viaCron = await hasValidCronSecret(req)
  const viaUser = viaCron || (await getAuthenticatedUserId(req)) !== null
  if (!viaCron && !viaUser) {
    if (cronSecretConfigured()) return json({ error: 'Unauthorized' }, 401, req)
    console.error(
      'gmail-sync: SECURITY — unauthenticated invocation allowed; set CRON_SECRET to require auth',
    )
  }

  const credentials = readGmailCredentials()
  if (!credentials) {
    console.log('gmail-sync: Google secrets not configured — noop')
    return json(
      {
        status: 'noop',
        reason:
          'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GMAIL_REFRESH_TOKEN not set — see docs/deploy/gmail-sync-setup.md',
      },
      200,
      req,
    )
  }

  let supabase: SupabaseClient
  let userId: string
  let selfEmail: string | null
  try {
    supabase = createServiceClient()
    const resolved = await resolveUser(supabase)
    userId = resolved.id
    selfEmail = resolved.email
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`gmail-sync: ${msg}`)
    return json({ error: msg }, 500, req)
  }

  const summary: RunSummary = {
    status: 'success',
    fetched: 0,
    stored: 0,
    labeled: 0,
    skipped_irrelevant: 0,
    auto_transitioned: 0,
    errors: [],
  }

  try {
    // Re-invocation guard (endpoint is unauthenticated for pg_cron, like
    // prospector-cron): skip if a run finished moments ago.
    const { data: state } = await supabase
      .from('gmail_sync_state')
      .select('history_id, last_synced_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (state?.last_synced_at) {
      const ageMs = Date.now() - new Date(state.last_synced_at).getTime()
      if (ageMs >= 0 && ageMs < MIN_SECONDS_BETWEEN_RUNS * 1000) {
        return json({ status: 'noop', reason: `last run ${Math.round(ageMs / 1000)}s ago` }, 200, req)
      }
    }

    const accessToken = await refreshAccessToken(credentials)
    const listing = await listNewMessageIds(accessToken, state?.history_id ?? null)
    summary.mode = listing.mode

    // Dedupe against already-ingested messages.
    let unseenIds = listing.messageIds
    if (unseenIds.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from('emails')
        .select('gmail_message_id')
        .eq('user_id', userId)
        .in('gmail_message_id', unseenIds)
      if (existingError) throw new Error(`emails dedupe lookup failed: ${existingError.message}`)
      const seen = new Set((existing ?? []).map((r) => r.gmail_message_id))
      unseenIds = unseenIds.filter((id) => !seen.has(id))
    }

    const toProcess = unseenIds.slice(0, MAX_MESSAGES_PER_RUN)
    const processedAllUnseen = toProcess.length === unseenIds.length
    summary.fetched = toProcess.length

    if (toProcess.length > 0) {
      const candidates = await loadCandidates(supabase, userId)
      const labelMap = await loadLabelMap(supabase, userId)
      // One labels.list call per run resolves label ids → names (BR-037).
      let labelNamesById: Record<string, string> = {}
      if (labelMap.length > 0) {
        try {
          labelNamesById = await listLabelNames(accessToken)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`gmail-sync: labels.list failed — continuing without label mapping: ${msg}`)
        }
      }

      for (const messageId of toProcess) {
        try {
          const meta = await fetchMessageMeta(accessToken, messageId)
          if (!meta) continue
          const labelNames = meta.labelIds
            .map((id) => labelNamesById[id])
            .filter((name): name is string => Boolean(name))
          await processMessage(supabase, userId, selfEmail, meta, labelNames, labelMap, candidates, summary)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`gmail-sync: message ${messageId} failed: ${msg}`)
          summary.errors.push(`[${messageId}] ${msg}`)
        }
      }
    }

    // Advance the cursor only when this run drained everything unseen, so a
    // truncated run resumes instead of skipping mail (see gmail.ts).
    const nextCursor = processedAllUnseen
      ? listing.newHistoryId
      : (state?.history_id ?? listing.newHistoryId)

    if (summary.errors.length > 0) {
      summary.status = summary.stored > 0 ? 'partial' : 'error'
    } else if (summary.fetched === 0) {
      summary.status = 'noop'
    }

    await writeSyncState(supabase, userId, {
      historyId: nextCursor,
      status: summary.status,
      error: summary.errors.length > 0 ? summary.errors.join(' | ') : null,
    })

    console.log(
      `gmail-sync: done — status=${summary.status} mode=${summary.mode} fetched=${summary.fetched} ` +
        `stored=${summary.stored} labeled=${summary.labeled} skipped=${summary.skipped_irrelevant} ` +
        `transitioned=${summary.auto_transitioned}`,
    )
    return json(summary, 200, req)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`gmail-sync: run failed: ${msg}`)
    summary.status = 'error'
    summary.errors.push(msg)
    await writeSyncState(supabase, userId, { status: 'error', error: msg })
    return json(summary, 500, req)
  }
})
