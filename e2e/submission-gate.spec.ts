import { test, expect } from '@playwright/test'

// Phase 4 — client enqueue wiring (ADR-006, BR-130..136): the Submission Gate
// panel (src/features/applications/components/SubmissionGatePanel.tsx) now turns
// an approval/score into a real `application_queue` row that the submission
// worker drains. On the explicit path it shows "Queued for submission" (never
// "submitted"); in assist/auto mode an above-threshold packet auto-queues
// ("Auto-queued (<mode> mode)"); queued rows offer a Cancel action.
//
// The gate is rendered on the Pipeline dashboard, which lives behind the auth
// guard — so its queued / auto-queued / cancel states require an authenticated
// session and live Supabase rows and cannot be deterministically exercised
// without VITE_SUPABASE_*. These specs assert the surface stays reachable and
// protected; the queue state transitions are covered by the service +
// decideQueueAction unit tests (submissionQueueService.test.ts) (LSN-003).

test.describe('Submission gate (client enqueue) surface', () => {
  test('pipeline route hosting the submission gate is auth-guarded (redirects to /login)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('login renders the sign-in form for the gate surface', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })
})
