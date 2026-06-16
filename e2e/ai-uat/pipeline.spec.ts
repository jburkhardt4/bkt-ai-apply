/**
 * Pipeline: AI exploration @pipeline
 *
 * Authenticated agent that explores the Pipeline page, reports on stage columns,
 * application cards, and any UI anomalies. Does NOT mutate data.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

// Expected pipeline stages from docs/domain/pipeline-stages.md
const KNOWN_STAGES = [
  'Discovery',
  'Applied',
  'Screening',
  'Interview Scheduled',
  'Interview Complete',
  'Offer',
  'Hired',
  'Rejected',
  'Ghosted',
]

test.describe('Pipeline: AI exploration @pipeline', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('AI agent reports pipeline page state', async (_fixtures, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)

      // Navigate to pipeline
      await stagehand.page.act({ action: 'navigate to the Pipeline page' })
      await stagehand.page.waitForLoadState('networkidle')

      const pipelineState = await stagehand.page.extract({
        instruction:
          'Describe the pipeline page in detail: what stage columns or sections are visible, how many application cards exist, are there any loading spinners, empty-state messages, or error messag[...]',
        schema: z.object({
          stagesVisible: z.array(z.string()),
          applicationCount: z.number(),
          isLoading: z.boolean(),
          isEmpty: z.boolean(),
          emptyStateMessage: z.string().optional(),
          errors: z.array(z.string()),
          uiIssues: z.array(z.string()),
          observations: z.string(),
        }),
      })

      await testInfo.attach('pipeline-state', {
        body: JSON.stringify(pipelineState, null, 2),
        contentType: 'application/json',
      })

      // Soft assertions — report findings without hard-failing on empty pipeline
      if (pipelineState.errors.length > 0) {
        console.warn('Pipeline errors detected:', pipelineState.errors)
      }
      if (pipelineState.uiIssues.length > 0) {
        console.warn('Pipeline UI issues detected:', pipelineState.uiIssues)
      }

      // Hard assertion: no error messages on the page
      expect(
        pipelineState.errors,
        `Pipeline page has errors: ${pipelineState.errors.join('; ')}`,
      ).toHaveLength(0)
    } finally {
      await stagehand.close()
    }
  })

  test('AI agent checks for unexpected stage labels', async (_fixtures, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'navigate to the Pipeline page' })
      await stagehand.page.waitForLoadState('networkidle')

      const stages = await stagehand.page.extract({
        instruction: 'List all stage labels, column headings, or status labels visible on the pipeline.',
        schema: z.object({
          stageLabels: z.array(z.string()),
        }),
      })

      await testInfo.attach('stage-labels', {
        body: JSON.stringify(stages, null, 2),
        contentType: 'application/json',
      })

      // Check for any completely unexpected stage names
      const unknownStages = stages.stageLabels.filter(
        (label) => !KNOWN_STAGES.some((k) => label.toLowerCase().includes(k.toLowerCase())),
      )
      if (unknownStages.length > 0) {
        console.warn(
          'Unknown stage labels (may be intentional):',
          unknownStages,
        )
      }
    } finally {
      await stagehand.close()
    }
  })
})
