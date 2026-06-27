import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Mobile accessibility gate (iPhone 17 Pro Max, 440x956 — the `mobile` Playwright
// project). Runs axe-core WCAG 2 A/AA against the PUBLIC login route in both the
// light theme and the bkt dark palette. Dark is toggled via the `data-theme`
// attribute the tokens key on (prefers-color-scheme does nothing in this app).
// Authenticated-route a11y needs a seeded user and is tracked separately in
// mobile-authenticated.mobile.spec.ts; extend this file with the same hasCreds
// skip pattern once that coverage lands.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test.describe('mobile a11y @ 440px', () => {
  test('login has no WCAG A/AA violations (light)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations).toEqual([])
  })

  test('login has no WCAG A/AA violations (dark)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    // Set the attribute the bkt palette keys on AFTER load — an init-script
    // attribute does not survive this app's hydration (see scripts/shot.ts).
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations).toEqual([])
  })
})
