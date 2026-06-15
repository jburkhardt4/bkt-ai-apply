/**
 * Prospector: AI exploration @prospector
 *
 * Authenticated agent that explores the Prospector (job discovery) page.
 * Reports on job cards, filters, sidebar, and any loading/error states.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

test.describe('Prospector: AI exploration @prospector', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('AI agent reports prospector page state', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)

      await stagehand.page.act({ action: 'navigate to the Prospector or job discovery page' })
      await stagehand.page.waitForLoadState('networkidle')

      const state = await stagehand.page.extract({
        instruction:
          'Describe the Prospector page: are there job listings or cards visible? Is there a search bar, filters, or sidebar? Are there any loading spinners, empty states, or error messages?',
        schema: z.object({
          jobCount: z.number(),
          hasSearchBar: z.boolean(),
          hasFilters: z.boolean(),
          hasSidebar: z.boolean(),
          isLoading: z.boolean(),
          isEmpty: z.boolean(),
          emptyStateMessage: z.string().optional(),
          errors: z.array(z.string()),
          uiIssues: z.array(z.string()),
          observations: z.string(),
        }),
      })

      await testInfo.attach('prospector-state', {
        body: JSON.stringify(state, null, 2),
        contentType: 'application/json',
      })

      expect(
        state.errors,
        `Prospector page has errors: ${state.errors.join('; ')}`,
      ).toHaveLength(0)
    } finally {
      await stagehand.close()
    }
  })

  test('AI agent interacts with a job card if visible', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'navigate to the Prospector or job discovery page' })
      await stagehand.page.waitForLoadState('networkidle')

      // Check if there are job cards to interact with
      const availability = await stagehand.page.extract({
        instruction: 'Are there any job listing cards or job result items on the page?',
        schema: z.object({ hasJobs: z.boolean() }),
      })

      if (!availability.hasJobs) {
        console.info('No job cards found — skipping interaction test (empty state or loading)')
        return
      }

      // Click the first job card
      await stagehand.page.act({ action: 'click the first job listing card or result' })
      await stagehand.page.waitForLoadState('networkidle')

      const afterClick = await stagehand.page.extract({
        instruction:
          'What appeared after clicking a job card? Is there a detail panel, modal, or new page? Are there any errors?',
        schema: z.object({
          panelOrModalOpened: z.boolean(),
          description: z.string(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
        }),
      })

      await testInfo.attach('job-card-interaction', {
        body: JSON.stringify(afterClick, null, 2),
        contentType: 'application/json',
      })

      expect(
        afterClick.hasErrors,
        `Error after clicking job card: ${afterClick.errorText}`,
      ).toBe(false)
    } finally {
      await stagehand.close()
    }
  })
})
