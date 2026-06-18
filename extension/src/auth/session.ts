// BKT Apply-Macro — Supabase session extraction (session handoff, spec §8).
//
// Reads the signed-in user's Supabase session from the SPA's localStorage.
// supabase-js v2 persists the session under `sb-<project-ref>-auth-token` (no
// custom storageKey is set in src/lib/supabase.ts, so this default holds). We
// SCAN for that key rather than hardcoding the project ref, then derive the
// project URL from the ref. Only the user's OWN session is read, in their OWN
// browser; the token is relayed solely to the extension's background worker
// (chrome.runtime messaging) and never to any ATS page or third party.

export interface ExtractedSession {
  /** Supabase project ref parsed from the storage key. */
  ref: string
  /** Project REST/Functions base URL derived from the ref. */
  url: string
  /** The user's JWT — used as `Authorization: Bearer` for RLS-scoped calls. */
  accessToken: string
  refreshToken: string | null
  /** Unix seconds; lets the background detect an expired token. */
  expiresAt: number | null
  userId: string | null
}

/**
 * Pulls the current Supabase session out of localStorage, or null when signed
 * out / unreadable. Never throws.
 *
 * SELF-CONTAINED (references only `globalThis`, JSON, and RegExp literals) so the
 * exact same function is injected via Playwright `page.evaluate` in a
 * deterministic fixture test AND bundled into the SPA reader content script —
 * the same pattern as applyAutofill / renderMatchScorePanel.
 */
export function extractSupabaseSession(): ExtractedSession | null {
  try {
    const storage = globalThis.localStorage as Storage | undefined
    if (!storage) return null

    let authKey: string | null = null
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && /^sb-.+-auth-token$/.test(k)) {
        authKey = k
        break
      }
    }
    if (!authKey) return null

    const refMatch = authKey.match(/^sb-(.+)-auth-token$/)
    const ref = refMatch ? refMatch[1] : ''

    const raw = storage.getItem(authKey)
    if (!raw) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null

    // supabase-js v2 stores the session object directly; older shapes nest it
    // under `currentSession`. Handle both defensively.
    const root = parsed as Record<string, unknown>
    const session = (
      'currentSession' in root && root.currentSession && typeof root.currentSession === 'object'
        ? (root.currentSession as Record<string, unknown>)
        : root
    ) as Record<string, unknown>

    const accessToken = typeof session.access_token === 'string' ? session.access_token : ''
    if (!accessToken) return null

    const user = session.user as { id?: unknown } | undefined

    return {
      ref,
      url: ref ? `https://${ref}.supabase.co` : '',
      accessToken,
      refreshToken: typeof session.refresh_token === 'string' ? session.refresh_token : null,
      expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null,
      userId: user && typeof user.id === 'string' ? user.id : null,
    }
  } catch {
    return null
  }
}
