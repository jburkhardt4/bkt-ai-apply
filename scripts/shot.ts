/**
 * shot.ts — iPhone 17 Pro Max visual-QA capture for the mobile design loop.
 *
 *   pnpm shot /login before      # capture the baseline before a change
 *   pnpm shot /login after       # capture again and eyeball .screens/after-*.png
 *   pnpm shot                     # defaults to route "/", label "after"
 *
 * Captures the blueprint matrix at the iPhone 17 Pro Max viewport
 * (440x956 CSS px, devicePixelRatio 3) into .screens/:
 *   <label>-<route>-full.png       portrait, full page (light)
 *   <label>-<route>-fold.png       portrait, above-the-fold (light)
 *   <label>-<route>-dark.png       portrait, full page (dark)
 *   <label>-<route>-landscape.png  landscape 956x440
 *
 * Two iPhone-specific quirks this script handles that the naive blueprint
 * version gets wrong for THIS app:
 *
 *  1. Dark mode. The bkt palette is driven by the `data-theme="dark"` attribute,
 *     NOT prefers-color-scheme — so `emulateMedia({colorScheme:'dark'})` would do
 *     nothing. We set the attribute AFTER load (an init-script attribute does not
 *     survive this app's hydration) so the final capture is genuinely dark. There
 *     is no in-app dark toggle yet, so these shots preview an otherwise-unreachable
 *     state — useful for token QA.
 *
 *  2. Safe-area insets. Headless Chromium has no notch, so env(safe-area-inset-*)
 *     resolves to 0 and the safe-area padding would be invisible. We SIMULATE the
 *     iPhone 17 Pro Max insets (portrait top 59 / bottom 34; landscape L/R 59 /
 *     bottom 21) by overriding the --safe-* tokens, so the screenshots actually
 *     show the padding working. Set SIMULATE_INSETS=0 to capture raw (0-inset).
 *     This is an approximation — real-device verification is still required.
 *
 * Dev server: expects Vite on :5173 (run `pnpm dev`). Override the target with
 * SHOT_BASE_URL, or it auto-derives the Codespaces forwarded URL.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'

const iPhone17ProMax = {
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}

const simulateInsets = process.env['SIMULATE_INSETS'] !== '0'

/** Use a pre-installed Chromium (e.g. Codespaces /opt/pw-browsers) when the
 *  bundled-browser revision isn't downloaded; falls back to Playwright's default. */
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

function baseUrl(): string {
  if (process.env['SHOT_BASE_URL']) return process.env['SHOT_BASE_URL'] as string
  if (process.env['AI_UAT_BASE_URL']) return process.env['AI_UAT_BASE_URL'] as string
  const cs = process.env['CODESPACE_NAME']
  if (cs) {
    const domain = process.env['GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN'] ?? 'app.github.dev'
    return `https://${cs}-5173.${domain}`
  }
  return 'http://localhost:5173'
}

const route = process.argv[2] ?? '/'
const label = process.argv[3] ?? 'after'
const url = `${baseUrl()}${route}`
const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'root'
const dir = '.screens'

type Insets = [top: number, bottom: number, left: number, right: number]

/** Navigate, then apply theme + simulated insets to the FINAL DOM and let fonts
 *  settle, so the capture reflects exactly what we want to QA. */
async function prepare(page: Page, opts: { dark?: boolean; insets?: Insets }): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => undefined)
  await page.evaluate(
    ({ dark, insets }) => {
      if (dark) document.documentElement.setAttribute('data-theme', 'dark')
      if (insets) {
        const [t, b, l, r] = insets
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${t}px;--safe-bottom:${b}px;--safe-left:${l}px;--safe-right:${r}px;}`
        document.documentElement.appendChild(s)
      }
    },
    { dark: Boolean(opts.dark), insets: opts.insets ?? null },
  )
  // Geist is a network webfont; wait for it so captures are deterministic.
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined)
  await page.waitForTimeout(250)
}

async function main(): Promise<void> {
  await mkdir(dir, { recursive: true })
  const executablePath = preinstalledChromium()
  const browser: Browser = await chromium.launch(executablePath ? { executablePath } : {})
  const portraitInsets: Insets = [59, 34, 0, 0]
  const landscapeInsets: Insets = [0, 21, 59, 59]

  // Portrait, light: full page + above-the-fold.
  const light: BrowserContext = await browser.newContext({ ...iPhone17ProMax })
  const lp = await light.newPage()
  await prepare(lp, { insets: simulateInsets ? portraitInsets : undefined })
  await lp.screenshot({ path: `${dir}/${label}-${slug}-full.png`, fullPage: true })
  await lp.screenshot({ path: `${dir}/${label}-${slug}-fold.png` })
  await light.close()

  // Portrait, dark: toggle the data-theme the bkt palette keys on.
  const dark: BrowserContext = await browser.newContext({ ...iPhone17ProMax })
  const dp = await dark.newPage()
  await prepare(dp, { dark: true, insets: simulateInsets ? portraitInsets : undefined })
  await dp.screenshot({ path: `${dir}/${label}-${slug}-dark.png`, fullPage: true })
  await dark.close()

  // Landscape: home indicator shrinks (21) and the notch moves to the side (59).
  const land: BrowserContext = await browser.newContext({ ...iPhone17ProMax, viewport: { width: 956, height: 440 } })
  const landPage = await land.newPage()
  await prepare(landPage, { insets: simulateInsets ? landscapeInsets : undefined })
  await landPage.screenshot({ path: `${dir}/${label}-${slug}-landscape.png` })
  await land.close()

  await browser.close()
  const note = simulateInsets ? ' (safe-area insets simulated)' : ''
  console.log(`[shot] ${url} -> ${dir}/${label}-${slug}-{full,fold,dark,landscape}.png${note}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
