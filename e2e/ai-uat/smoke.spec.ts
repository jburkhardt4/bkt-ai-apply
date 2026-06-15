/**
 * Smoke: public surface @smoke
 *
 * Fast, auth-free sanity check against the live URL.
 * Uses vanilla Playwright (no Stagehand) — no LLM calls means fast, cheap, deterministic.
 * Target: < 60 s total. Run with: pnpm test:uat:smoke
 */
import { test, expect } from '@playwright/test'
import { UAT_BASE_URL } from './_helpers/setup'

test.describe('Smoke: public surface @smoke', () => {
  test('homepage redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto(UAT_BASE_URL)
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('login page renders email, password, and sign-in button', async ({ page }) => {
    await page.goto(`${UAT_BASE_URL}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('page has a non-empty <title>', async ({ page }) => {
    await page.goto(`${UAT_BASE_URL}/login`)
    await page.waitForLoadState('domcontentloaded')
    const title = await page.title()
    expect(title.trim().length).toBeGreaterThan(0)
  })

  test('no uncaught JS errors on login page load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto(`${UAT_BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    expect(errors, `Uncaught JS errors: ${errors.join(' | ')}`).toHaveLength(0)
  })

  test('invalid credentials surface an error message', async ({ page }) => {
    await page.goto(`${UAT_BASE_URL}/login`)
    await page.locator('input[type="email"]').fill('smoke-test-invalid@no-such-domain.example')
    await page.locator('input[type="password"]').fill('wrongpassword123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(
      page.getByText(/invalid|error|failed|incorrect|unauthorized|credentials/i),
    ).toBeVisible({ timeout: 20_000 })
  })
})
