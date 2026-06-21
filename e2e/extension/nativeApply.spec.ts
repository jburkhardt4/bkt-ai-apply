/**
 * Native quick-apply detection — B7 @extension
 *
 * Drives the real detector (extension/src/nativeApply.ts) against LOCAL fixtures
 * in a real Chromium DOM via `page.evaluate` — the same self-contained functions
 * the MV3 content script injects. The detector is READ-ONLY and the renderer only
 * informs; clicking the native button (an OAuth/sign-in popup) is the human's to
 * do — we never auto-click (BR-151). See docs/features/…apply-macro-extension §5.3.
 */
import { test, expect } from '@playwright/test'
import { detectNativeApply, renderNativeApplyNote } from '../../extension/src/nativeApply'
import { nativeApplyFixtureHtml } from './fixtures/nativeApply'

test.describe('Apply-macro native quick-apply detection (B7) @extension', () => {
  test('detects "Quick Apply with MyGreenhouse" and ignores a plain Submit button', async ({
    page,
  }) => {
    await page.setContent(nativeApplyFixtureHtml)
    const options = await page.evaluate(detectNativeApply)
    // Exactly one option: the account accelerator. The "Submit Application"
    // negative control must NOT be mistaken for a native quick-apply.
    expect(options).toEqual([{ provider: 'greenhouse', label: 'Quick Apply with MyGreenhouse' }])
  })

  test('detects multiple providers — deduped, in signature order (not DOM order)', async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><html><body>
      <button id="ia">Apply with Indeed</button>
      <a href="#" id="ea1">Easy Apply</a>
      <a href="#" id="ea2">Easy Apply</a>
      <button id="gh">Apply with Greenhouse</button>
    </body></html>`)
    const options = await page.evaluate(detectNativeApply)
    // Two "Easy Apply" → one linkedin (dedupe); returned greenhouse→linkedin→indeed
    // regardless of the DOM order above (stable signature order).
    expect(options.map((o) => o.provider)).toEqual(['greenhouse', 'linkedin', 'indeed'])
  })

  test('never detects the extension\'s own injected controls', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>
      <div id="bkt-apply-root"><button>Easy Apply</button></div>
      <div id="bkt-fit-panel"><a href="#">Apply with Indeed</a></div>
    </body></html>`)
    const options = await page.evaluate(detectNativeApply)
    expect(options).toEqual([])
  })

  test('returns [] when no account-based quick-apply is present (a plain "Apply" submit is not one)', async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><html><body><form>
      <input id="email" type="email" />
      <button type="submit">Apply now</button>
    </form></body></html>`)
    const options = await page.evaluate(detectNativeApply)
    expect(options).toEqual([])
  })

  test('renderNativeApplyNote surfaces the recommendation, and clears on empty', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.evaluate(renderNativeApplyNote, [
      { provider: 'greenhouse' as const, label: 'Quick Apply with MyGreenhouse' },
    ])
    const note = page.locator('#bkt-native-apply')
    await expect(note).toBeVisible()
    await expect(note).toContainText('native quick-apply')
    await expect(note).toContainText('Quick Apply with MyGreenhouse')
    await expect(note).toContainText('Greenhouse account')
    await expect(note).toContainText('we never click it for you')
    // Re-rendering with no options removes the note (idempotent).
    await page.evaluate(renderNativeApplyNote, [])
    await expect(page.locator('#bkt-native-apply')).toHaveCount(0)
  })

  test('never auto-clicks the native button (BR-151)', async ({ page }) => {
    await page.setContent(nativeApplyFixtureHtml)
    await page.evaluate(() => {
      document
        .getElementById('mygreenhouse-btn')
        ?.addEventListener('click', () => document.body.setAttribute('data-native-clicked', '1'))
    })
    const options = await page.evaluate(detectNativeApply)
    await page.evaluate(renderNativeApplyNote, options)
    // Detector + renderer ran; the native control was surfaced but NOT clicked.
    expect(options.map((o) => o.provider)).toContain('greenhouse')
    expect(await page.getAttribute('body', 'data-native-clicked')).toBeNull()
  })
})
