import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mobile accessibility gate (iPhone 17 Pro Max, 440x956 — the `mobile` Playwright
// project). Runs axe-core WCAG 2 A/AA in BOTH the light theme and the bkt dark
// palette. The scheme is forced the real-user way (ADR-023): seed
// localStorage['bkt-theme'] before load and let the index.html FOUC guard apply
// `data-theme` on first paint — deterministic regardless of the runner's OS.
//
// Public coverage (/login) always runs. Authenticated coverage runs only when
// TEST_USER_EMAIL / TEST_USER_PASSWORD are set (the convention from
// mobile-authenticated.mobile.spec.ts) and skips cleanly otherwise.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const EMAIL = process.env['TEST_USER_EMAIL'] ?? ''
const PASSWORD = process.env['TEST_USER_PASSWORD'] ?? ''
const hasCreds = Boolean(EMAIL && PASSWORD)

/** Persist the theme before any navigation so the FOUC guard paints it. */
async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('bkt-theme', t as string)
    } catch {
      /* ignore */
    }
  }, theme)
}

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForURL(/\/login/, { timeout: 20_000 })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible({ timeout: 20_000 })
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(results.violations).toEqual([])
}

test.describe('mobile a11y @ 440px', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`login has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await seedTheme(page, theme)
      await page.goto('/login')
      await expect(page.locator('input[type="email"]')).toBeVisible()
      if (theme === 'dark') {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      }
      await expectNoViolations(page)
    })
  }

  test.describe('authenticated', () => {
    test.skip(!hasCreds, 'set TEST_USER_EMAIL / TEST_USER_PASSWORD to run authenticated a11y')

    for (const theme of ['light', 'dark'] as const) {
      test(`dashboard has no WCAG A/AA violations (${theme})`, async ({ page }) => {
        await seedTheme(page, theme)
        await login(page)
        await expectNoViolations(page)
      })

      test(`preferences has no WCAG A/AA violations (${theme})`, async ({ page }) => {
        await seedTheme(page, theme)
        await login(page)
        await page.goto('/preferences')
        await expect(page.getByRole('button', { name: /open navigation/i })).toBeVisible({ timeout: 20_000 })
        await expectNoViolations(page)
      })
    }
  })
})
