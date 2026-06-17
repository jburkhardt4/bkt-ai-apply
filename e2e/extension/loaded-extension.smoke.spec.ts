/**
 * MV3 loaded-extension smoke @extension-runtime
 *
 * Loads the BUILT unpacked extension (extension/dist) into Chromium and verifies
 * the content script actually injects + runs the macro on a supported ATS host.
 * The Greenhouse fixture is served AT a manifest-matched host via route
 * interception, so the real content_scripts injection path executes — no manifest
 * pollution, no network, no auth.
 *
 * Prereq: `pnpm build:ext` (or `node scripts/build-extension.mjs`). Skips if the
 * build is missing. Extension loading needs a browser context that allows
 * extensions; if the environment cannot launch one (e.g. no display), the test
 * reports it rather than silently passing.
 */
import { test, expect, chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { greenhouseFixtureHtml } from './fixtures/greenhouse'

const EXT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension/dist')

test.describe('MV3 extension — loaded-extension smoke @extension-runtime', () => {
  test.skip(
    !existsSync(resolve(EXT_DIR, 'manifest.json')),
    'extension not built — run `pnpm build:ext` first',
  )
  // Chromium only loads extensions in HEADED mode; on a headless box run under a
  // virtual display: `xvfb-run -a pnpm test:ext`.
  test.skip(!process.env['DISPLAY'], 'loaded-extension smoke needs a display (run via xvfb-run)')

  test('content script injects the panel + autofill button on a supported ATS page', async () => {
    test.setTimeout(90_000)
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    })
    try {
      // Confirm the extension actually loaded — its MV3 background service worker
      // registers. A clear signal if extension loading itself failed.
      if (context.serviceWorkers().length === 0) {
        await context.waitForEvent('serviceworker', { timeout: 20_000 }).catch(() => undefined)
      }
      expect(
        context.serviceWorkers().length,
        'extension background service worker did not register (extension failed to load)',
      ).toBeGreaterThan(0)

      // Serve the Greenhouse fixture AT a manifest-matched host so the real
      // content-script injection path runs — no real network, no manifest pollution.
      await context.route('https://boards.greenhouse.io/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: greenhouseFixtureHtml }),
      )
      const page = await context.newPage()
      await page.goto('https://boards.greenhouse.io/philo/jobs/7958304', {
        waitUntil: 'domcontentloaded',
      })

      await expect(page.locator('html')).toHaveAttribute('data-bkt-apply', 'greenhouse', {
        timeout: 15_000,
      })
      await expect(page.locator('#bkt-fit-panel')).toBeVisible()
      await expect(page.locator('#bkt-autofill-btn')).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
