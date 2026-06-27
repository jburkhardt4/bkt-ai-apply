import { defineConfig } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'

// Prefer a pre-installed Chromium (e.g. Codespaces PLAYWRIGHT_BROWSERS_PATH) when
// the bundled-browser revision isn't downloaded locally. Returns undefined when
// none is found, so CI (which runs `playwright install`) uses the default browser.
function preinstalledChromium(): string | undefined {
  const root = process.env['PLAYWRIGHT_BROWSERS_PATH']
  if (!root || !existsSync(root)) return undefined
  const dir = readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .pop()
  if (!dir) return undefined
  const exe = `${root}/${dir}/chrome-linux/chrome`
  return existsSync(exe) ? exe : undefined
}
const chromiumPath = preinstalledChromium()

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  // Desktop is the default project and runs every spec EXCEPT *.mobile.spec.ts,
  // with no viewport override — so existing desktop coverage is unchanged. The
  // mobile project runs only *.mobile.spec.ts at the iPhone 17 Pro Max logical
  // viewport (440x956 CSS px, devicePixelRatio 3, Chromium engine) to exercise
  // the useIsMobile() layouts. NB: Chromium does not synthesize physical device
  // safe-area insets, so env(safe-area-inset-*) reports 0 here — safe-area
  // regressions must be checked on a real device (see scripts/shot.ts notes).
  projects: [
    {
      name: 'desktop',
      testIgnore: /\.mobile\.spec\.ts$/,
    },
    {
      name: 'mobile',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
})
