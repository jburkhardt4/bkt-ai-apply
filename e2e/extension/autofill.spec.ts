/**
 * Apply-macro autofill — Greenhouse / Lever / Ashby fixtures @extension
 *
 * Phase 2b. Drives the real autofill macro + Match-Score panel against LOCAL
 * fixtures in a real Chromium DOM via `page.evaluate` (the same self-contained
 * functions the MV3 content script will inject). No SPA, no network, no
 * auth/CORS — see docs/features/simplifyai-apply-macro-extension.md §5.3.
 */
import { test, expect } from '@playwright/test'
import { applyAutofill } from '../../extension/src/autofill'
import { renderMatchScorePanel } from '../../extension/src/matchScorePanel'
import { resolveBoardConfig } from '../../extension/src/configs'
import { greenhouseConfig } from '../../extension/src/configs/greenhouse'
import { leverConfig } from '../../extension/src/configs/lever'
import { ashbyConfig } from '../../extension/src/configs/ashby'
import { buildPayload } from '../../extension/src/payload'
import { installReactSelectMock } from './fixtures/reactSelectMock'
import { greenhouseFixtureHtml } from './fixtures/greenhouse'
import { leverFixtureHtml } from './fixtures/lever'
import { ashbyFixtureHtml } from './fixtures/ashby'

const payload = buildPayload({
  fullName: 'John Burkhardt',
  email: 'john@bktadvisory.com',
  phone: '555-0100',
  linkedin: 'https://www.linkedin.com/in/jburkhardt',
  workAuthorization: 'Authorized to work in the US',
})

test.describe('Apply-macro — host resolution @extension', () => {
  test('resolves supported boards and is inert otherwise (UAT-5)', () => {
    expect(resolveBoardConfig('boards.greenhouse.io')?.ats).toBe('greenhouse')
    expect(resolveBoardConfig('jobs.lever.co')?.ats).toBe('lever')
    expect(resolveBoardConfig('jobs.ashbyhq.com')?.ats).toBe('ashby')
    expect(resolveBoardConfig('acme.ashbyhq.com')?.ats).toBe('ashby')
    expect(resolveBoardConfig('example.com')).toBeNull()
  })
})

test.describe('Apply-macro autofill — Greenhouse @extension', () => {
  test('fills text fields + react-select work auth; reports file (UAT-2)', async ({ page }) => {
    await page.setContent(greenhouseFixtureHtml)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })

    expect(report.filled).toEqual(
      expect.arrayContaining(['first_name', 'last_name', 'email', 'phone', 'linkedin', 'work_auth']),
    )
    expect(await page.inputValue('#first_name')).toBe('John')
    expect(await page.inputValue('#last_name')).toBe('Burkhardt')
    expect(await page.inputValue('#email')).toBe('john@bktadvisory.com')
    expect(await page.inputValue('#phone')).toBe('555-0100')
    expect(await page.inputValue('#linkedin')).toBe('https://www.linkedin.com/in/jburkhardt')
    // react-select committed the matching option onto the control.
    expect(await page.getAttribute('#work_auth_control', 'data-value')).toContain('Authorized')
    // The file input is reported for the human, never fabricated (§5.2).
    const skipped = Object.fromEntries(report.skipped.map((s) => [s.key, s.reason]))
    expect(skipped['resume']).toBe('manual_required')
  })

  test('reports missing fields on DOM drift without throwing (§5.2)', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>')
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })
    expect(report.filled).toHaveLength(0)
    expect(report.missing).toEqual(
      expect.arrayContaining(['first_name', 'email', 'work_auth']),
    )
  })

  test('never auto-submits the form (BR-151, UAT-3)', async ({ page }) => {
    await page.setContent(greenhouseFixtureHtml)
    await page.evaluate(installReactSelectMock)
    await page.evaluate(() => {
      document.getElementById('application_form')?.addEventListener('submit', (e) => {
        e.preventDefault()
        document.body.setAttribute('data-submitted', '1')
      })
    })
    await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })
    expect(await page.getAttribute('body', 'data-submitted')).toBeNull()
  })
})

test.describe('Apply-macro autofill — Lever @extension', () => {
  test('fills the single combined name field + contact fields', async ({ page }) => {
    await page.setContent(leverFixtureHtml)
    const report = await page.evaluate(applyAutofill, { config: leverConfig, payload })

    expect(report.filled).toEqual(expect.arrayContaining(['full_name', 'email', 'phone', 'linkedin']))
    expect(await page.inputValue('input[name="name"]')).toBe('John Burkhardt')
    expect(await page.inputValue('input[name="email"]')).toBe('john@bktadvisory.com')
    const skipped = Object.fromEntries(report.skipped.map((s) => [s.key, s.reason]))
    expect(skipped['resume']).toBe('manual_required')
  })
})

test.describe('Apply-macro autofill — Ashby @extension', () => {
  test('fills react form fields + react-select work auth', async ({ page }) => {
    await page.setContent(ashbyFixtureHtml)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: ashbyConfig, payload })

    expect(report.filled).toEqual(expect.arrayContaining(['full_name', 'email', 'work_auth']))
    expect(await page.inputValue('input[name="_systemfield_name"]')).toBe('John Burkhardt')
    expect(await page.getAttribute('#ashby_work_auth_control', 'data-value')).toContain('Authorized')
  })
})

test.describe('Apply-macro Match-Score panel @extension', () => {
  test('renders the score + fit summary before apply (UAT-1)', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>')
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
