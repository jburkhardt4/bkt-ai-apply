/**
 * Apply-macro payload + config mapping @extension
 *
 * Pure-function assertions for the expanded ATS field set: buildPayload's key
 * emission (contact, EEO key renames, sponsorship tri-state, answer:<key>
 * prefixing) and the new board-config field coverage (incl. the Workday
 * registration). No DOM/page needed — runs in the extension Playwright project.
 */
import { test, expect } from '@playwright/test'
import { buildPayload } from '../../extension/src/payload'
import { resolveBoardConfig, BOARD_CONFIGS } from '../../extension/src/configs'
import { greenhouseConfig } from '../../extension/src/configs/greenhouse'
import { leverConfig } from '../../extension/src/configs/lever'
import { ashbyConfig } from '../../extension/src/configs/ashby'
import { workdayConfig } from '../../extension/src/configs/workday'

test.describe('buildPayload — expanded field set @extension', () => {
  test('emits the new contact keys + first/last split + full_name', () => {
    const p = buildPayload({
      fullName: 'John Burkhardt',
      preferredName: 'JB',
      email: 'john@bktadvisory.com',
      phone: '555-0100',
      phoneCountry: '+1',
      linkedin: 'https://linkedin.com/in/jb',
      website: 'https://bktadvisory.com',
      location: 'Austin',
      state: 'Texas',
      workAuthorization: 'Authorized to work in the US',
    })
    expect(p).toMatchObject({
      full_name: 'John Burkhardt',
      first_name: 'John',
      last_name: 'Burkhardt',
      preferred_name: 'JB',
      email: 'john@bktadvisory.com',
      phone: '555-0100',
      phone_country: '+1',
      linkedin: 'https://linkedin.com/in/jb',
      website: 'https://bktadvisory.com',
      location: 'Austin',
      state: 'Texas',
      work_auth: 'Authorized to work in the US',
    })
  })

  test('requires_sponsorship is a tri-state → Yes / No / omitted', () => {
    expect(buildPayload({ requiresSponsorship: true })['requires_sponsorship']).toBe('Yes')
    expect(buildPayload({ requiresSponsorship: false })['requires_sponsorship']).toBe('No')
    // undefined → omitted (macro reports no_value rather than guessing).
    expect('requires_sponsorship' in buildPayload({})).toBe(false)
  })

  test('maps eeo_disclosures sub-keys to eeo_* payload keys, dropping blanks', () => {
    const p = buildPayload({
      eeo: {
        gender: 'Male',
        race_ethnicity: 'White',
        hispanic_latino: 'No',
        veteran_status: 'Not a veteran',
        disability_status: '   ', // blank → dropped
      },
    })
    expect(p).toMatchObject({
      eeo_gender: 'Male',
      eeo_race: 'White',
      eeo_hispanic_latino: 'No',
      eeo_veteran: 'Not a veteran',
    })
    expect('eeo_disability' in p).toBe(false)
  })

  test('prefixes custom screener answers as answer:<question_key>, dropping blanks', () => {
    const p = buildPayload({
      answers: { years_experience: '12', salary_expectation: '', notice_period: '2 weeks' },
    })
    expect(p['answer:years_experience']).toBe('12')
    expect(p['answer:notice_period']).toBe('2 weeks')
    expect('answer:salary_expectation' in p).toBe(false)
  })

  test('omits empty/whitespace contact values (never overwrites with a blank)', () => {
    const p = buildPayload({ email: '', website: undefined, location: 'Austin' })
    expect('email' in p).toBe(false)
    expect('website' in p).toBe(false)
    expect(p['location']).toBe('Austin')
  })
})

test.describe('Board configs — expanded coverage @extension', () => {
  const keysOf = (cfg: { fields: { key: string }[] }) => cfg.fields.map((f) => f.key)

  test('Greenhouse maps the expanded field set incl. EEO react-selects + cover_letter', () => {
    const keys = keysOf(greenhouseConfig)
    expect(keys).toEqual(
      expect.arrayContaining([
        'first_name',
        'last_name',
        'preferred_name',
        'website',
        'location',
        'cover_letter',
        'requires_sponsorship',
        'eeo_gender',
        'eeo_race',
        'eeo_hispanic_latino',
        'eeo_veteran',
        'eeo_disability',
      ]),
    )
    // Files stay file-typed (→ manual_required); EEO uses a choice strategy.
    expect(greenhouseConfig.fields.find((f) => f.key === 'cover_letter')?.type).toBe('file')
    expect(greenhouseConfig.fields.find((f) => f.key === 'eeo_gender')?.type).toBe('react-select')
    // Guardrail: never auto-submit (BR-151).
    expect(greenhouseConfig.submit.autoClick).toBe(false)
  })

  test('Lever adds location/website + native-select EEO', () => {
    const keys = keysOf(leverConfig)
    expect(keys).toEqual(
      expect.arrayContaining(['location', 'website', 'eeo_gender', 'eeo_race', 'eeo_veteran', 'eeo_disability']),
    )
    expect(leverConfig.fields.find((f) => f.key === 'eeo_gender')?.type).toBe('select')
    expect(leverConfig.submit.autoClick).toBe(false)
  })

  test('Ashby adds preferred name/website/location + sponsorship + EEO react-selects', () => {
    const keys = keysOf(ashbyConfig)
    expect(keys).toEqual(
      expect.arrayContaining([
        'preferred_name',
        'website',
        'location',
        'requires_sponsorship',
        'eeo_gender',
        'eeo_race',
        'eeo_veteran',
        'eeo_disability',
      ]),
    )
    expect(ashbyConfig.submit.autoClick).toBe(false)
  })

  test('Workday is registered and resolves on its hosts (Wave 2)', () => {
    expect(BOARD_CONFIGS).toContain(workdayConfig)
    expect(resolveBoardConfig('myco.wd5.myworkdayjobs.com')?.ats).toBe('workday')
    expect(resolveBoardConfig('myco.workday.com')?.ats).toBe('workday')
    // Resume is a file (→ manual_required) and never auto-submits (BR-151).
    expect(workdayConfig.fields.find((f) => f.key === 'resume')?.type).toBe('file')
    expect(workdayConfig.submit.autoClick).toBe(false)
    // Existing Wave 1 hosts still resolve correctly (no regression).
    expect(resolveBoardConfig('boards.greenhouse.io')?.ats).toBe('greenhouse')
    expect(resolveBoardConfig('jobs.ashbyhq.com')?.ats).toBe('ashby')
  })
})
