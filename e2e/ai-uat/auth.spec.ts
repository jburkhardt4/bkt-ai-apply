/**
 * Auth: AI-driven login/logout @auth
 *
 * Uses Stagehand's AI agent to evaluate the post-login experience and report
 * on what is visible, any errors, and whether the session persists on reload.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY (or ANTHROPIC_API_KEY)
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials, UAT_BASE_URL } from './_helpers/setup'

test.describe('Auth: AI-driven login + session @auth', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('AI agent logs in and describes the authenticated landing page', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)

      const result = await stagehand.page.extract({
        instruction:
          'Describe what is visible after a successful login: the page title or heading, main navigation items, any content areas, and whether there are any error messages or broken UI elements.',
        schema: z.object({
          pageHeading: z.string(),
          navItems: z.array(z.string()),
          contentAreas: z.array(z.string()),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
          observations: z.string(),
        }),
      })

      await testInfo.attach('post-login-state', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      })

      expect(result.hasErrors, `Login succeeded but page shows errors: ${result.errorText}`).toBe(
        false,
      )
      expect(stagehand.page.url()).not.toContain('/login')
    } finally {
      await stagehand.close()
    }
  })

  test('authenticated session persists on full page reload', async () => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.reload()
      await stagehand.page.waitForLoadState('networkidle')

      // After reload the app should still be on an authenticated route
      expect(stagehand.page.url()).not.toContain('/login')
    } finally {
      await stagehand.close()
    }
  })

  test('AI agent can navigate to all main pages without errors', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()
    const pageResults: Array<{ page: string; url: string; hasErrors: boolean; errorText?: string }> =
      []

    try {
      await loginWithTestUser(stagehand.page)

      // Ask AI to navigate to each main page and report errors
      const navTargets = ['Pipeline', 'Prospector', 'Settings']

      for (const target of navTargets) {
        try {
          await stagehand.page.act({
            action: `click the "${target}" link in the navigation`,
          })
          await stagehand.page.waitForLoadState('networkidle')

          const state = await stagehand.page.extract({
            instruction: `Is the ${target} page loaded? Are there any error messages, blank screens, or broken UI?`,
            schema: z.object({
              hasErrors: z.boolean(),
              errorText: z.string().optional(),
            }),
          })

          pageResults.push({
            page: target,
            url: stagehand.page.url(),
            ...state,
          })
        } catch (err) {
          pageResults.push({
            page: target,
            url: stagehand.page.url(),
            hasErrors: true,
            errorText: err instanceof Error ? err.message : String(err),
          })
        }
      }
    } finally {
      await testInfo.attach('navigation-results', {
        body: JSON.stringify(pageResults, null, 2),
        contentType: 'application/json',
      })
      await stagehand.close()
    }

    const failures = pageResults.filter((r) => r.hasErrors)
    expect(
      failures,
      `Pages with errors:\n${failures.map((f) => `  ${f.page}: ${f.errorText}`).join('\n')}`,
    ).toHaveLength(0)
  })
})
