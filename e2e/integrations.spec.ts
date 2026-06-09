import { test, expect } from '@playwright/test'

/**
 * Integrations (Settings) page e2e tests.
 *
 * LSN-003: e2e spec required for every new page/route with UI changes.
 * Unauthenticated flows are tested here; the authenticated Integrations
 * surface (provider status, model selector) requires a seeded session and is
 * exercised manually or in a future authenticated test suite.
 */

test.describe('Integrations — auth guard', () => {
  test('unauthenticated user visiting /settings is redirected to /login', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

test.describe('Integrations — login page reachable', () => {
  test('login page renders correctly before reaching settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
