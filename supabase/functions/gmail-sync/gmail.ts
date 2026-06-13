/**
 * gmail-sync — minimal Gmail REST client (read-only).
 *
 * Auth model (per docs/deploy/gmail-sync-setup.md): a one-time OAuth refresh
 * token for JB's Gmail account is stored as an Edge Function secret; each run
 * exchanges it for a short-lived access token. Scope is gmail.readonly only —
 * this module can never send or mutate mail.
 */

import { GmailApiError } from '../_shared/gmail-auth.ts'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** First-run bootstrap window and the per-run processing cap. */
export const BOOTSTRAP_QUERY = 'newer_than:7d'
export const MAX_MESSAGES_PER_RUN = 25

export interface GmailMessageMeta {
  id: string
  threadId: string | null
  historyId: string | null
  fromAddress: string
  subject: string | null
  snippet: string | null
  receivedAtIso: string
  /** Raw Gmail label ids (e.g. "Label_12", "INBOX") — resolve via listLabels. */
  labelIds: string[]
}

async function gmailFetch(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new GmailApiError(res.status, `Gmail API ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

export interface NewMessagesResult {
  messageIds: string[]
  /** Cursor to persist for the next incremental run. */
  newHistoryId: string | null
  mode: 'history' | 'bootstrap'
}

interface HistoryEntry {
  id?: string
  messagesAdded?: Array<{ message?: { id?: string } }>
}

/**
 * Incremental fetch via users.history.list when a cursor exists; falls back to
 * a 7-day bootstrap (users.messages.list) on first run or when Gmail reports
 * the cursor expired (404).
 */
export async function listNewMessageIds(
  accessToken: string,
  startHistoryId: string | null,
): Promise<NewMessagesResult> {
  if (startHistoryId) {
    try {
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: 'messageAdded',
        maxResults: '100',
      })
      const payload = await gmailFetch(`/history?${params.toString()}`, accessToken)
      const history = (payload.history as HistoryEntry[] | undefined) ?? []
      const ids = new Set<string>()
      for (const entry of history) {
        for (const added of entry.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id)
        }
      }
      // Full first page (≤100). The caller enforces MAX_MESSAGES_PER_RUN and
      // only advances the cursor when it processed everything unseen, so a
      // truncated run picks up where it left off instead of skipping mail.
      const newHistoryId =
        typeof payload.historyId === 'string' ? payload.historyId : startHistoryId
      return {
        messageIds: [...ids],
        newHistoryId,
        mode: 'history',
      }
    } catch (err) {
      // 404 = historyId too old (Gmail retains ~1 week) → re-bootstrap.
      if (!(err instanceof GmailApiError && err.status === 404)) throw err
      console.warn('gmail-sync: history cursor expired — re-bootstrapping')
    }
  }

  const params = new URLSearchParams({
    q: BOOTSTRAP_QUERY,
    maxResults: String(MAX_MESSAGES_PER_RUN),
  })
  const payload = await gmailFetch(`/messages?${params.toString()}`, accessToken)
  const messages = (payload.messages as Array<{ id?: string }> | undefined) ?? []

  // users.getProfile carries the account's current historyId — the cursor for
  // the next incremental run.
  const profile = await gmailFetch('/profile', accessToken)
  const newHistoryId = typeof profile.historyId === 'string' ? profile.historyId : null

  return {
    messageIds: messages.map((m) => m.id).filter((id): id is string => Boolean(id)),
    newHistoryId,
    mode: 'bootstrap',
  }
}

interface MessageHeader {
  name?: string
  value?: string
}

/** Minimal HTML-entity decode for Gmail snippets (&#39; &amp; &quot; &lt; &gt;). */
function decodeSnippet(snippet: string): string {
  return snippet
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export async function fetchMessageMeta(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageMeta | null> {
  const params = new URLSearchParams({ format: 'metadata' })
  params.append('metadataHeaders', 'From')
  params.append('metadataHeaders', 'Subject')
  const payload = await gmailFetch(`/messages/${messageId}?${params.toString()}`, accessToken)

  const headers =
    ((payload.payload as { headers?: MessageHeader[] } | undefined)?.headers ?? []) as MessageHeader[]
  const header = (name: string): string | null =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

  const fromAddress = header('From')
  if (!fromAddress) return null // undeliverable metadata — skip

  const internalDateMs = Number(payload.internalDate)
  const receivedAtIso = Number.isFinite(internalDateMs)
    ? new Date(internalDateMs).toISOString()
    : new Date().toISOString()

  return {
    id: String(payload.id ?? messageId),
    threadId: typeof payload.threadId === 'string' ? payload.threadId : null,
    historyId: typeof payload.historyId === 'string' ? payload.historyId : null,
    fromAddress,
    subject: header('Subject'),
    snippet: typeof payload.snippet === 'string' ? decodeSnippet(payload.snippet) : null,
    receivedAtIso,
    labelIds: Array.isArray(payload.labelIds)
      ? (payload.labelIds as unknown[]).filter((l): l is string => typeof l === 'string')
      : [],
  }
}

/** Resolves Gmail label ids → display names (users.labels.list, one call/run). */
export async function listLabelNames(accessToken: string): Promise<Record<string, string>> {
  const payload = await gmailFetch('/labels', accessToken)
  const labels = (payload.labels as Array<{ id?: string; name?: string }> | undefined) ?? []
  const byId: Record<string, string> = {}
  for (const label of labels) {
    if (label.id && label.name) byId[label.id] = label.name
  }
  return byId
}
