/**
 * Apply-macro session handoff — SPA reader @extension
 *
 * Phase 2b. Verifies the deterministic half of the "extension reads the SPA
 * session" handoff (spec §8): extractSupabaseSession pulls the user's Supabase
 * session out of the SPA's localStorage. The live half (background → real
 * candidate_profiles + score-job-fit with that JWT) requires a signed-in
 * session against real Supabase and is verified manually, not here.
 *
 * Uses route+goto (not setContent) so the page has a real https origin where
 * localStorage is writable.
 */
import { test, expect } from '@playwright/test'
import { extractSupabaseSession } from '../../extension/src/auth/session'

const FIXTURE_URL = 'https://bkt-fixture.local/'

async function openBlankOrigin(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`${FIXTURE_URL}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  )
  await page.goto(FIXTURE_URL)
}

test.describe('Apply-macro session handoff — SPA reader @extension', () => {
  test('extracts the session from the SPA localStorage (default supabase-js shape)', async ({
    page,
  }) => {
    await openBlankOrigin(page)
    await page.evaluate(() => {
      localStorage.setItem(
        'sb-rmoyuwesfljuygvpdolf-auth-token',
        JSON.stringify({
          access_token: 'jwt-abc',
          refresh_token: 'refresh-xyz',
          expires_at: 9999999999,
          token_type: 'bearer',
          user: { id: 'user-123' },
        }),
      )
    })
    const session = await page.evaluate(extractSupabaseSession)
    expect(session).not.toBeNull()
    expect(session?.ref).toBe('rmoyuwesfljuygvpdolf')
    expect(session?.url).toBe('https://rmoyuwesfljuygvpdolf.supabase.co')
    expect(session?.accessToken).toBe('jwt-abc')
    expect(session?.refreshToken).toBe('refresh-xyz')
    expect(session?.userId).toBe('user-123')
  })

  test('returns null when signed out (no supabase auth-token key)', async ({ page }) => {
    await openBlankOrigin(page)
    const session = await page.evaluate(extractSupabaseSession)
    expect(session).toBeNull()
  })

  test('handles the legacy currentSession-wrapped shape', async ({ page }) => {
    await openBlankOrigin(page)
    await page.evaluate(() => {
      localStorage.setItem(
        'sb-proj123-auth-token',
        JSON.stringify({ currentSession: { access_token: 'jwt-legacy', user: { id: 'u9' } } }),
      )
    })
    const session = await page.evaluate(extractSupabaseSession)
    expect(session?.accessToken).toBe('jwt-legacy')
    expect(session?.ref).toBe('proj123')
    expect(session?.userId).toBe('u9')
  })

  test('returns null for a malformed (non-JSON) token value', async ({ page }) => {
    await openBlankOrigin(page)
    await page.evaluate(() => localStorage.setItem('sb-x-auth-token', 'not-json{'))
    const session = await page.evaluate(extractSupabaseSession)
    expect(session).toBeNull()
  })
})
