import { test, expect } from '@playwright/test'

test.describe('Auth guard', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

test.describe('Login page', () => {
  test('login page renders email, password inputs and sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('notreal@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    // Supabase returns an auth error (invalid key or invalid credentials).
    // The LoginPage renders the error message in a plain <div> — match by text.
    await expect(
      page.getByText(/invalid|error|failed|incorrect|key|jwt/i),
    ).toBeVisible({ timeout: 15_000 })
  })
})
