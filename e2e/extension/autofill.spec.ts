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
import { greenhouseQuestionIdsFixtureHtml } from './fixtures/greenhouseQuestionIds'

const payload = buildPayload({
  fullName: 'John Burkhardt',
  email: 'john@bktadvisory.com',
  phone: '555-0100',
  linkedin: 'https://www.linkedin.com/in/jburkhardt',
  workAuthorization: 'Authorized to work in the US',
})

// Expanded profile exercising the new field set (preferred name, website,
// location, sponsorship tri-state, EEO disclosures, custom screener answers).
const fullPayload = buildPayload({
  fullName: 'John Burkhardt',
  preferredName: 'JB',
  email: 'john@bktadvisory.com',
  phone: '555-0100',
  phoneCountry: 'United States (+1)',
  linkedin: 'https://www.linkedin.com/in/jburkhardt',
  website: 'https://bktadvisory.com',
  location: 'Austin',
  state: 'Texas',
  workAuthorization: 'Authorized to work in the US',
  requiresSponsorship: false,
  // 'Male' is deliberate: the gender options list "Female" BEFORE "Male", and
  // "Female" contains the substring "male" — a regression to substring matching
  // would mis-select "Female". pickOption()'s exact-label-first tier must commit
  // "Male" (autofill.ts), which is what makes EEO/gender dropdowns safe (UAT-4).
  eeo: { gender: 'Male', race_ethnicity: 'White', veteran_status: 'I am not a veteran' },
  answers: { years_experience: '12' },
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

  test('fills the expanded field set: preferred name, website, location, sponsorship + EEO', async ({
    page,
  }) => {
    await page.setContent(greenhouseFixtureHtml)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload: fullPayload })

    // New native inputs.
    expect(await page.inputValue('#preferred_name')).toBe('JB')
    expect(await page.inputValue('#job_application_location')).toBe('Austin')
    expect(await page.inputValue('input[name="job_application[urls][Website]"]')).toBe(
      'https://bktadvisory.com',
    )
    expect(report.filled).toEqual(
      expect.arrayContaining(['preferred_name', 'website', 'location']),
    )

    // requires_sponsorship false → 'No' option committed on the react-select.
    expect(await page.getAttribute('#sponsorship_control', 'data-value')).toBe('No')
    // EEO gender committed EXACTLY "Male" — not the "Female" that contains it —
    // proving pickOption's exact-label-first match (anti-collision, UAT-4).
    expect(await page.getAttribute('#gender_control', 'data-value')).toBe('Male')
    expect(report.filled).toEqual(
      expect.arrayContaining(['requires_sponsorship', 'eeo_gender', 'work_auth']),
    )

    // Both file inputs (resume + cover letter) are flagged for the human (§5.2).
    const skipped = Object.fromEntries(report.skipped.map((s) => [s.key, s.reason]))
    expect(skipped['resume']).toBe('manual_required')
    expect(skipped['cover_letter']).toBe('manual_required')
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

test.describe('Apply-macro autofill — Greenhouse opaque-id template (B5 label matcher) @extension', () => {
  // Mirrors the live NeuraFlash UAT (Jam 2e14758d): every field is `#question_<id>`,
  // so greenhouse.ts' semantic selectors all miss and the fields are reachable only
  // by their visible <label> text — the exact failure the B5 matcher fixes.
  test('locates LinkedIn (text) + State (react-select) by <label> when #question_<id> selectors miss', async ({
    page,
  }) => {
    await page.setContent(greenhouseQuestionIdsFixtureHtml)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload: fullPayload })

    // Contact fields + LinkedIn fill via the label matcher despite opaque ids.
    expect(report.filled).toEqual(
      expect.arrayContaining(['first_name', 'last_name', 'email', 'phone', 'linkedin', 'state']),
    )
    expect(await page.inputValue('#question_17770736004')).toBe('John')
    expect(await page.inputValue('#question_17770736005')).toBe('Burkhardt')
    expect(await page.inputValue('#question_17770736006')).toBe('john@bktadvisory.com')
    expect(await page.inputValue('#question_17770736007')).toBe('555-0100')
    expect(await page.inputValue('#question_17770736010')).toBe('https://www.linkedin.com/in/jburkhardt')
    // State react-select committed the matching option via its label-anchored control.
    expect(await page.getAttribute('#state_rs', 'data-value')).toBe('Texas')
  })

  test('NEVER auto-locates sensitive EEO via label match — Gender stays human/review (BR-156)', async ({
    page,
  }) => {
    await page.setContent(greenhouseQuestionIdsFixtureHtml)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: greenhouseConfig, payload: fullPayload })

    // A "Gender" label is present and the payload carries eeo_gender='Male', but
    // the matcher must refuse it — sensitive fields are never fuzzy-located.
    expect(await page.getAttribute('#gender_rs', 'data-value')).toBeNull()
    expect(report.filled).not.toContain('eeo_gender')
    expect(report.missing).toContain('eeo_gender')
  })

  test('never auto-submits the opaque-id form (BR-151)', async ({ page }) => {
    await page.setContent(greenhouseQuestionIdsFixtureHtml)
    await page.evaluate(installReactSelectMock)
    await page.evaluate(() => {
      document.getElementById('application_form')?.addEventListener('submit', (e) => {
        e.preventDefault()
        document.body.setAttribute('data-submitted', '1')
      })
    })
    await page.evaluate(applyAutofill, { config: greenhouseConfig, payload: fullPayload })
    expect(await page.getAttribute('body', 'data-submitted')).toBeNull()
  })
})

test.describe('Apply-macro autofill — Ashby applySignals cross-board (B5) @extension', () => {
  // Proves wrapping ashby.ts in applySignals() lets the B5 label matcher recover
  // a field whose (hashed/aria) selector misses — Ashby's real-world pain — while
  // sensitive EEO stays gated. Same mechanism as Greenhouse, a different board.
  test('label fallback fills a non-sensitive miss (LinkedIn) but still gates sensitive EEO (BR-156)', async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><html><body>
      <form id="ashby_form">
        <div><label for="nm">Name</label><input id="nm" name="_systemfield_name" /></div>
        <!-- LinkedIn input carries NO aria-label/name/placeholder → ashby.ts'
             selector misses; only the visible "LinkedIn URL" label identifies it. -->
        <div><label for="li">LinkedIn URL</label><input id="li" type="text" /></div>
        <!-- Gender react-select with a hashed id (ashby selector misses) — sensitive,
             so the matcher must refuse it even though a "Gender" label is present. -->
        <div>
          <label for="gen-input">Gender</label>
          <div id="hashed_gender_xyz" class="select__control rs-control" tabindex="0"
               data-options="Female|Male|Non-binary">
            <div class="select__input-container"><input id="gen-input" class="select__input" /></div>
            <span class="select__placeholder">Select...</span>
          </div>
          <div class="rs-menu" hidden></div>
        </div>
        <button type="submit">Submit</button>
      </form>
    </body></html>`)
    await page.evaluate(installReactSelectMock)
    const report = await page.evaluate(applyAutofill, { config: ashbyConfig, payload: fullPayload })

    // full_name hits its direct selector; LinkedIn is recovered by its <label>.
    expect(report.filled).toEqual(expect.arrayContaining(['full_name', 'linkedin']))
    expect(await page.inputValue('#li')).toBe('https://www.linkedin.com/in/jburkhardt')
    // Sensitive eeo_gender: label present, but never fuzzy-located → stays missing.
    expect(await page.getAttribute('#hashed_gender_xyz', 'data-value')).toBeNull()
    expect(report.filled).not.toContain('eeo_gender')
    expect(report.missing).toContain('eeo_gender')
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
