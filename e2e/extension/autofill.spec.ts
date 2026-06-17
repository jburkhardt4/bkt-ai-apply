/**
 * Apply-macro autofill — Greenhouse fixture @extension
 *
 * Phase 2b. Drives the real autofill macro + Match-Score panel against a LOCAL
 * Greenhouse fixture in a real Chromium DOM via `page.evaluate` (the same
 * self-contained functions the MV3 content script will inject). No SPA, no
 * network, no auth/CORS — see docs/features/simplifyai-apply-macro-extension.md §5.3.
 */
import { test, expect } from '@playwright/test'
import { applyAutofill } from '../../extension/src/autofill'
import { renderMatchScorePanel } from '../../extension/src/matchScorePanel'
import { resolveBoardConfig } from '../../extension/src/configs'
import { greenhouseConfig } from '../../extension/src/configs/greenhouse'
import { buildPayload } from '../../extension/src/payload'
import { greenhouseFixtureHtml } from './fixtures/greenhouse'

const payload = buildPayload({
  fullName: 'John Burkhardt',
  email: 'john@bktadvisory.com',
  phone: '555-0100',
  linkedin: 'https://www.linkedin.com/in/jburkhardt',
  workAuthorization: 'yes',
})

test.describe('Apply-macro autofill — Greenhouse fixture @extension', () => {
  test('resolves the board config by host (inert on unsupported hosts)', () => {
    expect(resolveBoardConfig('boards.greenhouse.io')?.ats).toBe('greenhouse')
    expect(resolveBoardConfig('job-boards.greenhouse.io')?.ats).toBe('greenhouse')
    expect(resolveBoardConfig('example.com')).toBeNull()
  })

  test('fills mapped text fields and reports the rest (UAT-2)', async ({ page }) => {
    await page.setContent(greenhouseFixtureHtml)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })

    expect(report.filled).toEqual(
      expect.arrayContaining(['first_name', 'last_name', 'email', 'phone', 'linkedin']),
    )
    expect(await page.inputValue('#first_name')).toBe('John')
    expect(await page.inputValue('#last_name')).toBe('Burkhardt')
    expect(await page.inputValue('#email')).toBe('john@bktadvisory.com')
    expect(await page.inputValue('#phone')).toBe('555-0100')
    expect(await page.inputValue('#linkedin')).toBe('https://www.linkedin.com/in/jburkhardt')

    // File + react-select are never fabricated — they are flagged for the human (§5.2).
    const skipped = Object.fromEntries(report.skipped.map((s) => [s.key, s.reason]))
    expect(skipped['resume']).toBe('manual_required')
    expect(skipped['work_auth']).toBe('needs_strategy')
  })

  test('reports missing fields on DOM drift without throwing (§5.2)', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>')
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })
    expect(report.filled).toHaveLength(0)
    expect(report.missing).toEqual(
      expect.arrayContaining(['first_name', 'last_name', 'email', 'phone', 'linkedin']),
    )
  })

  test('never auto-submits the form (BR-151, UAT-3)', async ({ page }) => {
    await page.setContent(greenhouseFixtureHtml)
    await page.evaluate(() => {
      document.getElementById('application_form')?.addEventListener('submit', (e) => {
        e.preventDefault()
        document.body.setAttribute('data-submitted', '1')
      })
    })
    await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })
    expect(await page.getAttribute('body', 'data-submitted')).toBeNull()
  })

  test('renders the Match-Score panel before apply (UAT-1)', async ({ page }) => {
    await page.setContent(greenhouseFixtureHtml)
    await page.evaluate(renderMatchScorePanel, {
      score: 88,
      recommendation: 'apply',
      matched: ['Salesforce', 'React'],
      missing: ['Python'],
    })
    const panel = page.locator('#bkt-fit-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('88/100')
    await expect(panel).toContainText('Strong fit')
    await expect(panel).toContainText('Salesforce')
  })
})
