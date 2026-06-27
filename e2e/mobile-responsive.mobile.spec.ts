import { test, expect } from '@playwright/test'

// Mobile-responsive smoke (iPhone 17 Pro Max, 440x956 — the `mobile` Playwright
// project). The app is auth-guarded, so authenticated surfaces redirect to
// /login; here we assert the PUBLIC login route is wired into the mobile project
// and free of horizontal overflow at 440px (LoginPage hides its marketing panel
// under `hidden md:flex`). Authenticated mobile-layout coverage (drawer, stacked
// job cards, DocBuilder tabs) needs a seeded test user and is tracked separately.
test.describe('mobile @ 440px', () => {
  test('mobile project renders at a 440px viewport', async ({ page }) => {
    await page.goto('/login')
    const width = await page.evaluate(() => window.innerWidth)
    expect(width).toBe(440)
  })

  test('login route has no horizontal overflow at 440px', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    // Allow 1px sub-pixel rounding; anything more means a fixed-width element
    // is pushing the page wider than the phone viewport.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})
