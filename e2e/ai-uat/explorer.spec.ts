/**
 * Explorer: autonomous AI agent @explorer
 *
 * The most agentic scenario. Uses stagehand.page.observe() to discover interactive
 * elements without any predefined script, then acts on each one in turn, building
 * a live finding report. No hardcoded selectors. Pure AI-driven discovery.
 *
 * Think of this as "what would a QA engineer click first if they'd never seen the app?"
 *
 * Max 25 steps. 5-minute timeout (set in playwright.uat.config.ts per-test override).
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

const MAX_STEPS = 25
const SEVERITY_EMOJI = { info: 'ℹ️', warning: '⚠️', error: '🔴' } as const

type Severity = keyof typeof SEVERITY_EMOJI

interface Finding {
  step: number
  action: string
  finding: string
  url: string
  severity: Severity
}

test.describe('Explorer: autonomous agent @explorer', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  // Override to 5 minutes for this agent-loop test
  test.setTimeout(300_000)

  test('autonomous agent explores the authenticated app and reports findings', async (_fixtures, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    const findings: Finding[] = []
    const visited = new Set<string>()

    try {
      await loginWithTestUser(stagehand.page)

      for (let step = 0; step < MAX_STEPS; step++) {
        const currentUrl = stagehand.page.url()

        // Skip pages already explored to avoid cycling between the same URLs
        if (visited.has(currentUrl)) {
          findings.push({
            step,
            action: 'navigate',
            finding: `Already visited ${currentUrl} — stopping to avoid redundant exploration`,
            url: currentUrl,
            severity: 'info',
          })
          break
        }
        visited.add(currentUrl)

        // Discover all interactive elements on this page that look interesting
        const observations = await stagehand.page.observe({
          instruction:
            'List the most interesting and untested interactive elements on this page: navigation links, buttons, form fields, tabs, or expandable sections. Focus on things that look functionally important.',
        })

        if (!observations || observations.length === 0) {
          findings.push({
            step,
            action: 'observe',
            finding: 'No more interactive elements found — exploration complete',
            url: currentUrl,
            severity: 'info',
          })
          break
        }

        // AI chooses the first (most interesting) element from observations
        const nextAction = observations[0]
        const actionDescription = nextAction.description ?? String(nextAction)

        // Capture pre-action state
        const prePage = await stagehand.page.extract({
          instruction: 'Briefly: what page/section am I on? Any visible errors?',
          schema: z.object({ context: z.string(), hasError: z.boolean() }),
        })

        // Execute the action
        let actionFailed = false
        try {
          await stagehand.page.act({ action: actionDescription })
          await stagehand.page.waitForLoadState('networkidle').catch(() => {
            // Ignore timeout — some pages don't reach networkidle
          })
          await stagehand.page.waitForTimeout(500)
        } catch {
          actionFailed = true
        }

        if (actionFailed) {
          findings.push({
            step,
            action: actionDescription,
            finding: `Failed to execute — element may be hidden, disabled, or outside viewport`,
            url: currentUrl,
            severity: 'warning',
          })
          continue
        }

        // Evaluate what happened
        const postPage = await stagehand.page.extract({
          instruction:
            'What changed after the action? Note: any errors, navigation, modal/panel opening, data loading, or unexpected behavior. Be specific.',
          schema: z.object({
            description: z.string(),
            hasError: z.boolean(),
            errorText: z.string().optional(),
            navigationOccurred: z.boolean(),
            newUrl: z.string().optional(),
            unexpected: z.boolean(),
            unexpectedReason: z.string().optional(),
          }),
        })

        const severity: Severity = postPage.hasError
          ? 'error'
          : postPage.unexpected
            ? 'warning'
            : 'info'

        const findingText = [
          postPage.description,
          postPage.errorText ? `Error: ${postPage.errorText}` : null,
          postPage.unexpectedReason ? `Unexpected: ${postPage.unexpectedReason}` : null,
          !prePage.hasError && postPage.hasError ? '← was working before this action' : null,
        ]
          .filter(Boolean)
          .join(' | ')

        findings.push({
          step,
          action: actionDescription,
          finding: findingText,
          url: postPage.newUrl ?? stagehand.page.url(),
          severity,
        })
      }
    } finally {
      // Build a human-readable report and attach it to the Playwright test report
      const errors = findings.filter((f) => f.severity === 'error')
      const warnings = findings.filter((f) => f.severity === 'warning')

      const reportLines = [
        `# AI Explorer Report`,
        `Steps: ${findings.length}  |  Errors: ${errors.length}  |  Warnings: ${warnings.length}`,
        `Pages visited: ${[...visited].join(', ')}`,
        '',
        ...findings.map(
          (f) =>
            `${SEVERITY_EMOJI[f.severity]} Step ${f.step}: ${f.action}\n   → ${f.finding}\n   @ ${f.url}`,
        ),
        '',
        errors.length > 0
          ? `## Errors requiring attention\n${errors.map((e) => `- ${e.finding} (${e.url})`).join('\n')}`
          : '## No errors found ✅',
      ]

      const report = reportLines.join('\n')

      console.log('\n' + report + '\n')

      await testInfo.attach('explorer-report', {
        body: report,
        contentType: 'text/plain',
      })
      await testInfo.attach('explorer-findings-json', {
        body: JSON.stringify(findings, null, 2),
        contentType: 'application/json',
      })

      await stagehand.close()

      // Fail the test if the explorer encountered any errors during exploration
      expect(
        errors,
        `Explorer found ${errors.length} error(s):\n${errors.map((e) => `  - ${e.finding} (${e.url})`).join('\n')}`,
      ).toHaveLength(0)
    }
  })
})
