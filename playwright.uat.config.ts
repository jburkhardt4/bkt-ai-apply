import { defineConfig, devices } from '@playwright/test'

// Resolve the target base URL:
// 1. AI_UAT_BASE_URL env var (explicit override, works for prod or any remote)
// 2. CODESPACE_NAME env var (auto-detected GitHub Codespace dev server)
// 3. localhost fallback (local dev)
const BASE_URL =
  process.env['AI_UAT_BASE_URL']?.trim() ||
  (process.env['CODESPACE_NAME']
    ? `https://${process.env['CODESPACE_NAME']}-5173.app.github.dev`
    : 'http://localhost:5173')

export default defineConfig({
  testDir: './e2e/ai-uat',

  // AI-driven tests are slower — 120 s per test, 5 min for explorer
  timeout: 120_000,

  // No retries: AI agents are non-deterministic; a retry produces different results
  retries: 0,

  // Sequential: concurrent LLM calls would produce conflicting browser state
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/ai-uat', open: 'never' }],
    ['json', { outputFile: 'playwright-report/ai-uat/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Generous navigation timeout for remote environments
    navigationTimeout: 30_000,
    actionTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
