import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  // Desktop is the default project and runs every spec EXCEPT *.mobile.spec.ts,
  // with no viewport override — so existing desktop coverage is unchanged. The
  // mobile project runs only *.mobile.spec.ts at the iPhone 17 Pro Max logical
  // viewport (430x932, Chromium engine) to exercise the useIsMobile() layouts.
  projects: [
    {
      name: 'desktop',
      testIgnore: /\.mobile\.spec\.ts$/,
    },
    {
      name: 'mobile',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})
