import { test, expect } from '@playwright/test'

// Phase 3 — real document generation: the DocBuilder Auto-Align action now
// calls the routed generate-document Edge Function (with a template fallback),
// and the DocAssistant chat now calls the real ai-chat path. Both surfaces
// (Resumes /resumes, Cover Letters /cover-letters) live behind the auth guard,
// so unauthenticated visits redirect to /login. These specs assert the changed
// surfaces stay reachable and protected (LSN-003).

test.describe('Document builder routes', () => {
  test('resumes route is auth-guarded (redirects to /login)', async ({ page }) => {
    await page.goto('/resumes')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('cover-letters route is auth-guarded (redirects to /login)', async ({ page }) => {
    await page.goto('/cover-letters')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('login renders the sign-in form for the document surfaces', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
