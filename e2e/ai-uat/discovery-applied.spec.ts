/**
 * Discovery → Applied: real-session manual apply flow @discovery-applied
 *
 * Phase 2b DoD item 4. Logs in with a REAL Supabase session (no demo/synthetic
 * mode) and drives the seeded throwaway "[UAT] Senior Salesforce Administrator"
 * job through the manual handoff: Apply (→ In progress) then Mark as applied
 * (→ Applied), asserting the row reaches Applied with no errors.
 *
 * Runs against whatever TEST_USER_* points to — intended to be the dedicated
 * uat-test@bktadvisory.com account, where the [UAT] fixture is seeded, so the
 * real john@ pipeline is never mutated. The flow is destructive (it commits a
 * real discovery→applied transition on the fixture); re-arm the fixture between
 * runs with the reset SQL in docs/qa/apply-macro-phase1-2a-uat.md.
 *
 * The first Apply click opens the source posting in a new browser tab; the test
 * ignores that popup and keeps asserting against the main page.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY (or ANTHROPIC_API_KEY)
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

const UAT_JOB_TITLE = '[UAT] Senior Salesforce Administrator'

test.describe('Discovery → Applied: manual apply on a real session @discovery-applied', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('drives the seeded UAT job from discovery to applied', async (_fixtures, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)

      await stagehand.page.act({ action: 'navigate to the Your Jobs or job matches dashboard' })
      await stagehand.page.waitForLoadState('networkidle')

      // Confirm a REAL session (not demo/synthetic): the seeded fixture only
      // exists on the live account, so finding it proves we are on live data.
      const found = await stagehand.page.extract({
        instruction: `Is there a job titled "${UAT_JOB_TITLE}" anywhere in the job list (check any Review / In progress / Applied filter tabs)? What status does it currently show?`,
        schema: z.object({
          present: z.boolean(),
          status: z.string().optional(),
        }),
      })

      await testInfo.attach('discovery-applied-initial', {
        body: JSON.stringify(found, null, 2),
        contentType: 'application/json',
      })

      if (!found.present) {
        test.skip(
          true,
          `Seed fixture "${UAT_JOB_TITLE}" not found on the TEST_USER account — seed it (docs/qa/apply-macro-phase1-2a-uat.md) before running.`,
        )
        return
      }

      // Advance to Applied. From Review: Apply → In progress, then Mark as
      // applied → Applied. From In progress: a single Mark as applied. Two
      // attempts cover both starting states; each is a no-op once Applied.
      for (let attempt = 0; attempt < 2; attempt++) {
        const state = await stagehand.page.extract({
          instruction: `For the job "${UAT_JOB_TITLE}", is it already showing the "Applied" status?`,
          schema: z.object({ isApplied: z.boolean() }),
        })
        if (state.isApplied) break
        await stagehand.page.act({
          action: `click the primary apply or "Mark as applied" button on the job titled "${UAT_JOB_TITLE}"`,
        })
        await stagehand.page.waitForLoadState('networkidle')
      }

      const final = await stagehand.page.extract({
        instruction: `What is the final status of the job titled "${UAT_JOB_TITLE}"? Is it "Applied"? Are there any error messages visible on the page?`,
        schema: z.object({
          status: z.string(),
          isApplied: z.boolean(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
        }),
      })

      await testInfo.attach('discovery-applied-final', {
        body: JSON.stringify(final, null, 2),
        contentType: 'application/json',
      })

      expect(final.hasErrors, `Errors during the apply flow: ${final.errorText}`).toBe(false)
      expect(final.isApplied, `Job did not reach Applied (final status: ${final.status})`).toBe(true)
    } finally {
      await stagehand.close()
    }
  })
})
