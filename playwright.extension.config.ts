import { defineConfig, devices } from '@playwright/test'

// Playwright config for the Phase 2b extension's fixture tests. These exercise
// the autofill macro + Match-Score panel against LOCAL fixture ATS pages via
// page.setContent + page.evaluate — no SPA dev server, no network, no auth/CORS
// (docs/features/simplifyai-apply-macro-extension.md §5.3). Kept separate from
// playwright.config.ts (which boots the SPA) and playwright.uat.config.ts.
export default defineConfig({
  testDir: './e2e/extension',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
