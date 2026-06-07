import { test, expect } from '@playwright/test'

/**
 * Prospector page e2e tests.
 *
 * LSN-003: e2e spec required for every new page/route with UI changes.
 * These tests run against the real Supabase project — unauthenticated
 * flows are tested here; authenticated flows require a seeded session
 * and are exercised manually or in a future authenticated test suite.
 */

test.describe('Prospector — auth guard', () => {
  test('unauthenticated user visiting /prospector is redirected to /login', async ({ page }) => {
    await page.goto('/prospector')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

test.describe('Prospector — login page reachable', () => {
  test('login page renders correctly before reaching prospector', async ({ page }) => {
    await page.goto('/prospector')
    // Redirected to login — verify login form is present
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
