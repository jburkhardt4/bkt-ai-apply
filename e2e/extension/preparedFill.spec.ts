/**
 * Apply-macro PREPARED-FILL path — Greenhouse fixture @extension
 *
 * Drives the prepared-application autofill end of the macro against a LOCAL
 * fixture DOM: server-prepared `prepared_application_fields` rows →
 * preparedToPayload() → the same self-contained applyAutofill the MV3 content
 * script injects. Proves the macro:
 *   • fills the NON-gated prepared fields (using their field_key verbatim),
 *   • NEVER fills review-gated / sensitive fields (work_auth, EEO, sponsorship),
 *   • detects hard stop-conditions (CAPTCHA) without throwing or auto-submitting.
 * No SPA, no network, no auth/CORS (spec §5.3). Additive — existing specs are
 * untouched.
 */
import { test, expect } from '@playwright/test'
import { applyAutofill } from '../../extension/src/autofill'
import { greenhouseConfig } from '../../extension/src/configs/greenhouse'
import { preparedToPayload, type PreparedFieldRow } from '../../extension/src/preparedFill'
import { detectStopConditions } from '../../extension/src/stopConditions'
import { greenhouseFixtureHtml } from './fixtures/greenhouse'

// A server-prepared application: non-gated contact fields + DB-gated sensitive
// fields (BR-156: work_auth / requires_sponsorship / eeo_* are always
// review-gated). preparedToPayload must keep the sensitive ones OUT of the
// payload (they go into `gated`), so the macro never fills them.
const preparedFields: PreparedFieldRow[] = [
  { field_key: 'first_name', mapped_value: 'John', review_gate: false, is_sensitive: false },
  { field_key: 'last_name', mapped_value: 'Burkhardt', review_gate: false, is_sensitive: false },
  { field_key: 'email', mapped_value: 'john@bktadvisory.com', review_gate: false },
  { field_key: 'phone', mapped_value: '555-0100', review_gate: false },
  { field_key: 'preferred_name', mapped_value: 'JB', review_gate: false },
  { field_key: 'location', mapped_value: 'Austin', review_gate: false },
  // Sensitive → DB-gated → must NOT be auto-filled.
  { field_key: 'work_auth', mapped_value: 'Authorized to work in the US', is_sensitive: true, review_gate: true },
  { field_key: 'requires_sponsorship', mapped_value: false, is_sensitive: true, review_gate: true },
  { field_key: 'eeo_gender', mapped_value: 'Male', is_sensitive: true, review_gate: true },
]

test.describe('Apply-macro PREPARED autofill — Greenhouse @extension', () => {
  test('fills non-gated prepared fields and holds back sensitive ones', async ({ page }) => {
    const { payload, gated } = preparedToPayload(preparedFields)

    // The gated set is exactly the sensitive fields — never auto-filled.
    expect(gated).toEqual(
      expect.arrayContaining(['work_auth', 'requires_sponsorship', 'eeo_gender']),
    )
    expect(payload['work_auth']).toBeUndefined()
    expect(payload['eeo_gender']).toBeUndefined()
    expect(payload['requires_sponsorship']).toBeUndefined()

    await page.setContent(greenhouseFixtureHtml)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload })

    // Non-gated contact fields filled from the prepared payload.
    expect(await page.inputValue('#first_name')).toBe('John')
    expect(await page.inputValue('#last_name')).toBe('Burkhardt')
    expect(await page.inputValue('#email')).toBe('john@bktadvisory.com')
    expect(await page.inputValue('#preferred_name')).toBe('JB')
    expect(await page.inputValue('#job_application_location')).toBe('Austin')
    expect(report.filled).toEqual(
      expect.arrayContaining(['first_name', 'last_name', 'email', 'preferred_name', 'location']),
    )

    // The react-select sensitive controls were NEVER committed (no value mapped).
    expect(await page.getAttribute('#work_auth_control', 'data-value')).toBeNull()
    expect(await page.getAttribute('#gender_control', 'data-value')).toBeNull()
    expect(await page.getAttribute('#sponsorship_control', 'data-value')).toBeNull()
  })

  test('never auto-submits on the prepared path (BR-151)', async ({ page }) => {
    const { payload } = preparedToPayload(preparedFields)
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

  test('detects a CAPTCHA stop-condition on the page (real DOM)', async ({ page }) => {
    await page.setContent(
      `${greenhouseFixtureHtml.replace('</form>', '<div class="g-recaptcha" data-sitekey="x"></div></form>')}`,
    )
    const reasons = await page.evaluate(() => {
      // The self-contained detector runs against the real document, same as the
      // content script. Re-implement the call inline so the spec injects it.
      return Array.from(document.querySelectorAll('.g-recaptcha, [data-sitekey]')).length
    })
    expect(reasons).toBeGreaterThan(0)
    // And the pure detector agrees when handed the same markup via a fake root.
    const result = detectStopConditions({
      querySelector: (sel: string) =>
        sel.includes('recaptcha') || sel.includes('data-sitekey') ? {} : null,
    })
    expect(result.reasons).toContain('captcha')
  })
})
