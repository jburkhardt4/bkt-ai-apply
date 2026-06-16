/**
 * Apply Handoff: manual source-link apply @apply-handoff
 *
 * Phase 1 UAT. An authenticated AI agent confirms the review-mode control and
 * the mode-aware apply affordances on the dashboard: the JD-sidebar primary
 * button reads "Apply" / "Mark as applied", and a "View Job" control links out
 * to the original posting.
 *
 * Non-destructive: this spec observes labels and controls only. It does NOT
 * click Apply through to a discovery → applied transition, and it does not
 * confirm a manual apply — those pipeline-mutating steps are covered by the
 * manual UAT checklist (docs/qa/apply-macro-phase1-2a-uat.md), run against jobs
 * the tester actually intends to apply to.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY (or ANTHROPIC_API_KEY)
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

test.describe('Apply Handoff: manual source-link apply @apply-handoff', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('the review-mode control is present on the dashboard', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'navigate to the Your Jobs or job matches dashboard' })
      await stagehand.page.waitForLoadState('networkidle')

      const mode = await stagehand.page.extract({
        instruction:
          'Is there a review-mode control (a menu or toggle offering options like Review, Hybrid/Assist, or Auto) visible near the top of the page? Which mode does it currently show? Are there any error messages or broken UI?',
        schema: z.object({
          modeControlPresent: z.boolean(),
          currentMode: z.string().optional(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
        }),
      })

      await testInfo.attach('review-mode-control', {
        body: JSON.stringify(mode, null, 2),
        contentType: 'application/json',
      })

      expect(mode.hasErrors, `Dashboard shows errors: ${mode.errorText}`).toBe(false)
      expect(mode.modeControlPresent, 'Review-mode control not found on the dashboard').toBe(true)
    } finally {
      await stagehand.close()
    }
  })

  test('JD sidebar exposes an Apply action and a View Job link', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'navigate to the Your Jobs or job matches dashboard' })
      await stagehand.page.waitForLoadState('networkidle')

      const availability = await stagehand.page.extract({
        instruction: 'Are there any job cards or rows in the job list?',
        schema: z.object({ hasJobs: z.boolean() }),
      })
      if (!availability.hasJobs) {
        console.info('No jobs in the dashboard list — skipping apply-handoff assertion (empty state)')
        return
      }

      await stagehand.page.act({ action: 'open the first job to reveal its detail sidebar' })
      await stagehand.page.waitForLoadState('networkidle')

      const footer = await stagehand.page.extract({
        instruction:
          'In the open job detail sidebar footer, report the exact text of the primary apply button (for example "Apply" or "Mark as applied"), whether a "View Job" button exists, and whether the "View Job" button appears enabled or disabled. Are there any error messages?',
        schema: z.object({
          applyButtonText: z.string(),
          hasViewJob: z.boolean(),
          viewJobEnabled: z.boolean(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
        }),
      })

      await testInfo.attach('jd-sidebar-footer', {
        body: JSON.stringify(footer, null, 2),
        contentType: 'application/json',
      })

      expect(footer.hasErrors, `JD sidebar shows errors: ${footer.errorText}`).toBe(false)
      expect(
        /apply/i.test(footer.applyButtonText),
        `Unexpected apply button label: "${footer.applyButtonText}"`,
      ).toBe(true)
      expect(footer.hasViewJob, '"View Job" button not found in the sidebar footer').toBe(true)
    } finally {
      await stagehand.close()
    }
  })
})
