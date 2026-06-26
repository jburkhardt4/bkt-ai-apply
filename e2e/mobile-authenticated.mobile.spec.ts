import { test, expect, type Page } from '@playwright/test'

// Authenticated mobile smoke (iPhone 17 Pro Max, 430x932 — the `mobile`
// Playwright project). Exercises the useIsMobile() layouts *past* the auth gate:
// the slide-in nav drawer replacing the desktop sidebar, and key routes
// rendering without horizontal overflow at 430px.
//
// Credentials come from TEST_USER_EMAIL / TEST_USER_PASSWORD (the same
// convention as e2e/ai-uat/_helpers/setup.ts) — never hard-coded. The suite
// skips cleanly when they're absent, so it's safe in environments without a
// seeded user. The login form authenticates against the real Supabase project
// configured in .env.local.
const EMAIL = process.env['TEST_USER_EMAIL'] ?? ''
const PASSWORD = process.env['TEST_USER_PASSWORD'] ?? ''
const hasCreds = Boolean(EMAIL && PASSWORD)

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForURL(/\/login/, { timeout: 20_000 })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
  // The mobile shell is mounted once the hamburger top bar is visible.
  await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible({ timeout: 20_000 })
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  })
  // 1px allowance for sub-pixel rounding; more means a fixed-width element is
  // pushing the page wider than the 430px phone viewport.
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
}

test.describe('authenticated mobile @ 430px', () => {
  test.skip(!hasCreds, 'set TEST_USER_EMAIL / TEST_USER_PASSWORD to run authenticated mobile smoke')

  test('mobile shell: hamburger reveals the nav drawer; no horizontal overflow', async ({ page }) => {
    await login(page)
    const hamburger = page.getByRole('button', { name: /open navigation/i })
    await expect(hamburger).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // On mobile the sidebar lives behind the drawer — its nav (e.g. "Sign out")
    // is not in the DOM until the hamburger opens it.
    await expect(page.getByText('Sign out', { exact: true })).toHaveCount(0)
    await hamburger.click()
    await expect(page.getByText('Sign out', { exact: true })).toBeVisible()
    await expect(page.getByText('Job Search', { exact: true })).toBeVisible()
  })

  test('job search renders without horizontal overflow at 430px', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: /open navigation/i }).click()
    await page.getByText('Job Search', { exact: true }).click()
    await page.waitForURL(/\/search/, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible({ timeout: 20_000 })
    await expectNoHorizontalOverflow(page)
  })

  test('preferences renders single-column without horizontal overflow', async ({ page }) => {
    await login(page)
    await page.goto('/preferences')
    await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible({ timeout: 20_000 })
    await expectNoHorizontalOverflow(page)
  })
})
