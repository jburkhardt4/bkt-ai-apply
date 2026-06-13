import { test, expect } from '@playwright/test'

// Phase 2b — "make the dashboard honest": the Applications Submitted stat now
// derives from `applications` DB truth (applicationService.fetchSubmittedCount)
// rather than a localStorage delta. The Auto-Apply dashboard lives behind the
// auth guard, so an unauthenticated visit is redirected to /login. These specs
// assert the guarded surface stays reachable and protected (LSN-003).

test.describe('Auto-Apply dashboard route', () => {
  test('dashboard route is auth-guarded (redirects to /login)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('login renders the sign-in form for the dashboard surface', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
