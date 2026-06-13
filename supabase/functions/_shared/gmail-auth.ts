/**
 * Shared Gmail OAuth plumbing for gmail-sync and gmail-send.
 *
 * A one-time refresh token for JB's Gmail account lives in Edge Function
 * secrets (docs/deploy/gmail-sync-setup.md); each run exchanges it for a
 * short-lived access token. Scopes: gmail.readonly + gmail.send.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface GmailCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export class GmailApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Null when the Google secrets are not configured yet (callers no-op). */
export function readGmailCredentials(): GmailCredentials | null {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) return null
  return { clientId, clientSecret, refreshToken }
}

export async function refreshAccessToken(credentials: GmailCredentials): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new GmailApiError(res.status, `OAuth token refresh failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const payload = (await res.json()) as { access_token?: string }
  if (!payload.access_token) {
    throw new GmailApiError(500, 'OAuth token refresh returned no access_token')
  }
  return payload.access_token
}
