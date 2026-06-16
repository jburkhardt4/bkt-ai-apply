import { Stagehand } from '@browserbasehq/stagehand'
import type { Page } from '@playwright/test'

/**
 * Resolve the AI UAT base URL from env vars:
 *  1. AI_UAT_BASE_URL (explicit override — dev Codespace or Vercel prod)
 *  2. CODESPACE_NAME  (auto-detected GitHub Codespace)
 *  3. localhost       (local dev fallback)
 */
export const UAT_BASE_URL =
  process.env['AI_UAT_BASE_URL']?.trim() ||
  (process.env['CODESPACE_NAME']
    ? `https://${process.env['CODESPACE_NAME']}-5173.app.github.dev`
    : 'http://localhost:5173')

/**
 * Create a Stagehand instance.
 *
 * Uses Browserbase cloud when BROWSERBASE_API_KEY is present (CI/CD, scheduled runs).
 * Falls back to local Playwright when it is absent (local dev without Browserbase).
 *
 * LLM: ANTHROPIC_KEY (primary) or ANTHROPIC_API_KEY (alias), model AI_UAT_MODEL.
 * Mirrors the existing model-routing.md convention (BR-050 cost cap enforced
 * separately — AI UAT calls are out-of-band and not routed through ai-router.ts).
 */
export function makeStagehand(): Stagehand {
  const anthropicKey =
    process.env['ANTHROPIC_KEY'] ?? process.env['ANTHROPIC_API_KEY'] ?? ''
  const modelName = process.env['AI_UAT_MODEL'] ?? 'claude-3-5-sonnet-latest'
  const usesBrowserbase = Boolean(process.env['BROWSERBASE_API_KEY'])

  if (usesBrowserbase) {
    return new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env['BROWSERBASE_API_KEY'],
      projectId: process.env['BROWSERBASE_PROJECT_ID'],
      modelName,
      modelClientOptions: { apiKey: anthropicKey },
    })
  }

  return new Stagehand({
    env: 'LOCAL',
    modelName,
    modelClientOptions: { apiKey: anthropicKey },
    verbose: 1,
  })
}

/**
 * Log in with the dedicated UAT test account.
 *
 * Uses standard Playwright selectors (not AI) for the login form because:
 * - The selectors are already tested and stable (see e2e/pipeline.spec.ts)
 * - AI-driven login adds unnecessary latency + non-determinism to a known surface
 *
 * Requires TEST_USER_EMAIL and TEST_USER_PASSWORD env vars.
 */
export async function loginWithTestUser(page: Page): Promise<void> {
  const email = process.env['TEST_USER_EMAIL'] ?? ''
  const password = process.env['TEST_USER_PASSWORD'] ?? ''

  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set to run authenticated AI UAT scenarios.',
    )
  }

  await page.goto(UAT_BASE_URL)
  await page.waitForURL(/\/login/, { timeout: 15_000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 30_000,
  })
}

/** Returns true when the two required auth env vars are both set. */
export function hasTestCredentials(): boolean {
  return Boolean(process.env['TEST_USER_EMAIL'] && process.env['TEST_USER_PASSWORD'])
}
