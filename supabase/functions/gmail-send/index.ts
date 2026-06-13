/**
 * gmail-send — Edge Function (JWT-verified, user-invoked only — BR-038)
 *
 * Sends mail from JB's connected Gmail account (scope gmail.send) and drafts
 * replies with Gemini 2.5 Flash. Never autonomous: every send is an explicit
 * user action from the Inbox UI, and AI drafts are always returned for human
 * review — this function never sends a draft directly.
 *
 * Contract:
 *   POST { mode: 'reply'|'forward'|'compose', emailId?, to?, subject?, body }
 *     →  { sent: true, threadId? }
 *   POST { mode: 'draft', emailId }
 *     →  { draft }   (logs ai_model_usage task_type 'email_draft', BR-054)
 *
 * Guardrails:
 * - Caller identity via the forwarded Supabase JWT (verify_jwt + in-code check)
 * - Every email lookup scoped to the caller's user_id (BR-005)
 * - Rate guard: max 10 sends per rolling minute (notifications 'email_sent')
 * - Replies thread correctly: In-Reply-To/References + Gmail threadId
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CORS_HEADERS, json } from '../_shared/http.ts'
import { getAuthenticatedUserId } from '../_shared/auth.ts'
import { readGmailCredentials, refreshAccessToken, GmailApiError } from '../_shared/gmail-auth.ts'
import { getApiKeyForProvider, getProvider } from '../_shared/llm/factory.ts'
import { buildRawMessage, forwardSubject, replySubject } from './mime.ts'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GEMINI_MODEL_NAME = 'Gemini 2.5 Flash'
const DRAFT_MAX_TOKENS = 512
const MAX_SENDS_PER_MINUTE = 10

interface RequestBody {
  mode?: 'reply' | 'forward' | 'compose' | 'draft'
  emailId?: string
  to?: string
  subject?: string
  body?: string
}

interface EmailRow {
  id: string
  gmail_message_id: string
  thread_id: string | null
  from_address: string
  subject: string | null
  body_snippet: string | null
  classification: string
  application_id: string | null
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('gmail-send: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** "Jane Doe <jane@acme.com>" → "jane@acme.com". */
function extractAddress(fromHeader: string): string {
  const angled = fromHeader.match(/<([^>]+)>/)
  return (angled ? angled[1] : fromHeader).trim()
}

async function loadEmail(
  supabase: SupabaseClient,
  userId: string,
  emailId: string,
): Promise<EmailRow | null> {
  const { data, error } = await supabase
    .from('emails')
    .select('id, gmail_message_id, thread_id, from_address, subject, body_snippet, classification, application_id')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`emails lookup failed: ${error.message}`)
  return data as EmailRow | null
}

/** Original RFC Message-ID header, for reply threading. */
async function fetchMessageIdHeader(
  accessToken: string,
  gmailMessageId: string,
): Promise<string | null> {
  const params = new URLSearchParams({ format: 'metadata' })
  params.append('metadataHeaders', 'Message-ID')
  const res = await fetch(`${GMAIL_BASE}/messages/${gmailMessageId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null // threading is best-effort; threadId still applies
  const payload = (await res.json()) as {
    payload?: { headers?: Array<{ name?: string; value?: string }> }
  }
  return (
    payload.payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')?.value ?? null
  )
}

async function sendRaw(accessToken: string, raw: string, threadId: string | null): Promise<string | null> {
  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new GmailApiError(res.status, `Gmail send failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const payload = (await res.json()) as { threadId?: string }
  return payload.threadId ?? threadId
}

/** Rolling-minute rate guard backed by the email_sent notification audit rows. */
async function isRateLimited(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('notification_type', 'email_sent')
    .gte('created_at', cutoff)
  if (error) {
    console.error(`gmail-send: rate-guard lookup failed: ${error.message}`)
    return false // fail open on the guard, not on the send
  }
  return (count ?? 0) >= MAX_SENDS_PER_MINUTE
}

interface ApplicationContext {
  company: string | null
  title: string | null
  stage: string | null
}

async function loadApplicationContext(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string | null,
): Promise<ApplicationContext> {
  if (!applicationId) return { company: null, title: null, stage: null }
  const { data } = await supabase
    .from('applications')
    .select('stage, jobs(title, companies(name))')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle()
  interface Row {
    stage: string
    jobs: { title: string | null; companies: { name: string | null } | null } | null
  }
  const row = data as unknown as Row | null
  return {
    company: row?.jobs?.companies?.name ?? null,
    title: row?.jobs?.title ?? null,
    stage: row?.stage ?? null,
  }
}

async function draftReply(
  supabase: SupabaseClient,
  userId: string,
  email: EmailRow,
): Promise<string> {
  const apiKey = getApiKeyForProvider('google')
  if (!apiKey) {
    throw new Error('Gemini key not configured — cannot draft. Set GEMINI_KEY in Edge Function secrets.')
  }

  const context = await loadApplicationContext(supabase, userId, email.application_id)
  const system = [
    'You draft professional, concise reply emails for John Burkhardt, a Salesforce consulting leader managing his job applications.',
    'Write in first person as John. Plain text only, no subject line, no signature block beyond "Best regards,\\nJohn Burkhardt".',
    'Be warm, direct, and brief (under 150 words). Confirm specifics when scheduling; ask one clarifying question at most.',
    'Reply with the email body only.',
  ].join(' ')
  const user = [
    `Original email — From: ${email.from_address}`,
    `Subject: ${email.subject ?? '(none)'}`,
    `Snippet: ${email.body_snippet ?? '(none)'}`,
    `Classification: ${email.classification}`,
    context.company ? `Related application: ${context.title ?? 'role'} at ${context.company} (stage: ${context.stage})` : 'No matched application.',
    '',
    'Draft John\'s reply.',
  ].join('\n')

  const provider = getProvider('google')
  const result = await provider.complete(
    // thinkingBudget: 0 — same Gemini 2.5 Flash failure mode as classification;
    // a short professional reply needs no extended reasoning.
    { model: GEMINI_MODEL_NAME, system, messages: [{ role: 'user', content: user }], maxTokens: DRAFT_MAX_TOKENS, thinkingBudget: 0 },
    apiKey,
  )

  // BR-054: log tokens + cost (pricing mirrors src/lib/ai-router.ts Gemini Flash entry)
  const cost = result.usage.input_tokens * (0.3 / 1_000_000) + result.usage.output_tokens * (2.5 / 1_000_000)
  const { error } = await supabase.from('ai_model_usage').insert({
    user_id: userId,
    application_id: email.application_id,
    model_provider: 'google',
    model_name: GEMINI_MODEL_NAME,
    task_type: 'email_draft',
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    estimated_cost_usd: cost,
  })
  if (error) console.error(`gmail-send: ai_model_usage insert failed: ${error.message}`)

  return result.text.trim()
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const userId = await getAuthenticatedUserId(req)
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const mode = body.mode
  if (mode !== 'reply' && mode !== 'forward' && mode !== 'compose' && mode !== 'draft') {
    return json({ error: "mode must be 'reply' | 'forward' | 'compose' | 'draft'" }, 400)
  }

  let supabase: SupabaseClient
  try {
    supabase = createServiceClient()
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }

  try {
    /* ---- AI draft (no send) ---- */
    if (mode === 'draft') {
      if (!body.emailId) return json({ error: 'emailId required for draft' }, 400)
      const email = await loadEmail(supabase, userId, body.emailId)
      if (!email) return json({ error: 'Email not found' }, 404)
      const draft = await draftReply(supabase, userId, email)
      return json({ draft }, 200)
    }

    /* ---- send paths ---- */
    const credentials = readGmailCredentials()
    if (!credentials) {
      return json(
        { error: 'Gmail sending is not configured yet — see docs/deploy/gmail-sync-setup.md' },
        503,
      )
    }

    const messageBody = (body.body ?? '').trim()
    if (!messageBody) return json({ error: 'body required' }, 400)

    if (await isRateLimited(supabase, userId)) {
      return json({ error: `Rate limit: max ${MAX_SENDS_PER_MINUTE} sends per minute` }, 429)
    }

    const fromAddress = Deno.env.get('GMAIL_USER_EMAIL') ?? 'me'
    let to: string
    let subject: string
    let threadId: string | null = null
    let inReplyTo: string | null = null

    if (mode === 'compose') {
      if (!body.to?.trim()) return json({ error: 'to required for compose' }, 400)
      if (!body.subject?.trim()) return json({ error: 'subject required for compose' }, 400)
      to = body.to.trim()
      subject = body.subject.trim()
    } else {
      if (!body.emailId) return json({ error: `emailId required for ${mode}` }, 400)
      const email = await loadEmail(supabase, userId, body.emailId)
      if (!email) return json({ error: 'Email not found' }, 404)
      threadId = email.thread_id

      if (mode === 'reply') {
        to = body.to?.trim() || extractAddress(email.from_address)
        subject = body.subject?.trim() || replySubject(email.subject)
      } else {
        if (!body.to?.trim()) return json({ error: 'to required for forward' }, 400)
        to = body.to.trim()
        subject = body.subject?.trim() || forwardSubject(email.subject)
      }

      const accessTokenForMeta = await refreshAccessToken(credentials)
      if (mode === 'reply') {
        inReplyTo = await fetchMessageIdHeader(accessTokenForMeta, email.gmail_message_id)
      }
      const raw = buildRawMessage({ from: fromAddress, to, subject, body: messageBody, inReplyTo })
      const sentThreadId = await sendRaw(accessTokenForMeta, raw, threadId)

      await recordSend(supabase, userId, { mode, to, subject, applicationId: email.application_id })
      return json({ sent: true, threadId: sentThreadId }, 200)
    }

    const accessToken = await refreshAccessToken(credentials)
    const raw = buildRawMessage({ from: fromAddress, to, subject, body: messageBody, inReplyTo })
    const sentThreadId = await sendRaw(accessToken, raw, threadId)

    await recordSend(supabase, userId, { mode, to, subject, applicationId: null })
    return json({ sent: true, threadId: sentThreadId }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`gmail-send: ${msg}`)
    const status = err instanceof GmailApiError && err.status === 403 ? 403 : 500
    return json({ error: msg }, status)
  }
})

/** Audit row (also feeds the rate guard). Never throws. */
async function recordSend(
  supabase: SupabaseClient,
  userId: string,
  params: { mode: string; to: string; subject: string; applicationId: string | null },
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    application_id: params.applicationId,
    notification_type: 'email_sent',
    title: `Email sent (${params.mode})`,
    body: `To ${params.to} — ${params.subject}`,
  })
  if (error) console.error(`gmail-send: send audit insert failed: ${error.message}`)
}
