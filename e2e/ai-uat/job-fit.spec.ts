/**
 * Job Fit: Match Score + Fit Summary @job-fit
 *
 * Phase 2a UAT. An authenticated AI agent opens a job and reads the Fit surface
 * BEFORE any apply action — on the dashboard JD sidebar ("Job Fit" tab) and on
 * the Prospector job sheet. Asserts the panel renders a score or the explicit
 * "not scored yet" state, and never shows errors.
 *
 * Non-destructive: this spec only reads/observes. It never clicks Apply through
 * to a stage transition (that pipeline-mutating path is covered by the manual
 * UAT checklist, docs/qa/apply-macro-phase1-2a-uat.md).
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY (or ANTHROPIC_API_KEY)
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

test.describe('Job Fit: Match Score + Fit Summary @job-fit', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('dashboard JD sidebar Job Fit tab renders a score or unscored state', async ({}, testInfo) => {
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
        console.info('No jobs in the dashboard list — skipping Job Fit assertion (empty state)')
        return
      }

      await stagehand.page.act({ action: 'open the first job to reveal its detail sidebar' })
      await stagehand.page.waitForLoadState('networkidle')
      await stagehand.page.act({ action: 'click the "Job Fit" tab in the job detail sidebar' })

      const fit = await stagehand.page.extract({
        instruction:
          'On the Job Fit tab, report: is a numeric match score out of 100 shown? What is the fit label text near the score (for example "Perfect fit", "Strong fit", or "Possible fit")? Are there "Key Matches" and/or "Key Gaps" lists? Is an "Estimated — full AI scoring queued" chip visible? Is a "Not scored yet" message visible? Are there any error messages or broken UI?',
        schema: z.object({
          scoreVisible: z.boolean(),
          score: z.number().nullable(),
          fitLabel: z.string().optional(),
          hasKeyMatches: z.boolean(),
          hasKeyGaps: z.boolean(),
          estimatedChip: z.boolean(),
          unscoredMessage: z.boolean(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
          observations: z.string(),
        }),
      })

      await testInfo.attach('job-fit-jd-sidebar', {
        body: JSON.stringify(fit, null, 2),
        contentType: 'application/json',
      })

      expect(fit.hasErrors, `Job Fit tab shows errors: ${fit.errorText}`).toBe(false)
      // Every opened job must resolve to a real score OR the explicit unscored
      // empty state — never a blank or broken Job Fit tab.
      expect(
        fit.scoreVisible || fit.unscoredMessage,
        'Job Fit tab rendered neither a score nor the "Not scored yet" state',
      ).toBe(true)
    } finally {
      await stagehand.close()
    }
  })

  test('Prospector job sheet renders the fit panel without errors', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'navigate to the Prospector or job discovery page' })
      await stagehand.page.waitForLoadState('networkidle')

      const availability = await stagehand.page.extract({
        instruction: 'Are there any job listing cards on the page?',
        schema: z.object({ hasJobs: z.boolean() }),
      })
      if (!availability.hasJobs) {
        console.info('No prospector jobs — skipping fit panel assertion (empty state)')
        return
      }

      await stagehand.page.act({ action: 'click the first job listing card to open its detail sheet' })
      await stagehand.page.waitForLoadState('networkidle')

      const fit = await stagehand.page.extract({
        instruction:
          'In the open job sheet, is there a match score / fit summary section? Report whether a score, matched skills, or missing keywords are shown, whether it indicates it is loading or "not scored", and whether there are any error messages.',
        schema: z.object({
          fitSectionPresent: z.boolean(),
          scoreVisible: z.boolean(),
          isLoading: z.boolean(),
          unscored: z.boolean(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
          observations: z.string(),
        }),
      })

      await testInfo.attach('job-fit-prospector', {
        body: JSON.stringify(fit, null, 2),
        contentType: 'application/json',
      })

      expect(fit.hasErrors, `Prospector fit panel shows errors: ${fit.errorText}`).toBe(false)
    } finally {
      await stagehand.close()
    }
  })
})
