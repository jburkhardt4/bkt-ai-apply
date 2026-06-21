import type { BoardConfig } from '../types'
import { applySignals } from './fieldSignals'

/**
 * Greenhouse field-mapping config — Wave 1 (the board in the Jam recording).
 * Selectors follow Greenhouse's standard application form. Custom dropdowns
 * (work auth, sponsorship, EEO/demographics) render as react-select widgets and
 * are driven by the macro's react-select strategy (spec §3.2/§7).
 *
 * Greenhouse renders the resume + cover letter as file inputs (the macro flags
 * them manual_required — the human attaches them, BR-151), the core contact
 * fields as native inputs, and the EEO/demographic section
 * (gender / race / Hispanic-Latino / veteran / disability) as react-selects with
 * stable control ids. Selectors marked LIVE-TUNE need verification against a
 * real posting (Greenhouse occasionally hashes the react-select container ids).
 */
export const greenhouseConfig: BoardConfig = {
  ats: 'greenhouse',
  version: '2026-06-19',
  match: { hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'] },
  jd: { container: '#content, .job__description', title: 'h1.app-title' },
  // applySignals() enriches each field with default <label> synonyms + the
  // sensitive flag (configs/fieldSignals.ts), powering the B5 label-text fallback
  // used when Greenhouse's opaque `#question_<id>` selectors miss. EEO / work-auth
  // / sponsorship are flagged sensitive → never fuzzy-matched (BR-156); only their
  // direct selectors below ever apply.
  fields: applySignals([
    { key: 'first_name', selector: '#first_name', type: 'text' },
    { key: 'last_name', selector: '#last_name', type: 'text' },
    // Greenhouse has no dedicated preferred-name input on the standard form; some
    // postings add it as a custom question. LIVE-TUNE per posting.
    {
      key: 'preferred_name',
      selector: '#preferred_name, input[name*="preferred"]',
      type: 'text',
    },
    { key: 'email', selector: '#email', type: 'email' },
    { key: 'phone', selector: '#phone', type: 'tel' },
    // Phone country-code widget. Greenhouse renders an intl-tel-input style
    // country selector adjacent to the phone field on postings that collect it;
    // it is a react-select on the newer template and a native <select> on some.
    // We map it as react-select (the macro's pickOption tolerates a missing
    // control via report.missing). LIVE-TUNE — the container id varies per
    // posting; leave the human to set it if the selector does not resolve.
    {
      key: 'phone_country',
      selector:
        '#phone_country_control, [id*="phone_country"] .select__control, [class*="country"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    // NOTE: employment_history is intentionally NOT mapped. Greenhouse's standard
    // application form has no stable flat inputs for prior employment (it is
    // resume-driven; some postings add bespoke custom questions with hashed
    // names). Inventing selectors here would risk filling the wrong field
    // (UAT-4). The prepared-application path surfaces employment_history as a
    // review-gated block for the human instead — see preparedFill.ts.
    {
      key: 'linkedin',
      selector: 'input[name*="urls"][name*="LinkedIn"], input[name*="linkedin"]',
      type: 'url',
    },
    // Website / portfolio custom-URL question (Greenhouse stores these under
    // job_application[urls][...]). LIVE-TUNE — the URL label varies per posting.
    {
      key: 'website',
      selector:
        'input[name*="urls"][name*="Website"], input[name*="urls"][name*="Portfolio"], input[name*="website"]',
      type: 'url',
    },
    // Greenhouse's standard form has a single "Location (City)" autocomplete on
    // some postings; it is a plain text input on others. LIVE-TUNE.
    {
      key: 'location',
      selector: '#job_application_location, input[name*="location"], #location',
      type: 'text',
    },
    // State of residence — react-select on the job-boards template ("In which
    // state do you currently reside?"). The control id is opaque (`question_<id>`),
    // so the direct selector is best-effort; the B5 matcher resolves it by the
    // `state` label synonyms. Value comes from candidate_profiles.state.
    {
      key: 'state',
      selector: '#state_control, [id*="state"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    // Country — react-select ("Country"). Locator-ready via the `country` label;
    // its value is pending the new candidate_profiles.location_country column
    // (Part B3), so today it reports no_value rather than filling.
    {
      key: 'country',
      selector: '#country_control, [id*="country"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    { key: 'resume', selector: 'input[type="file"][name*="resume"]', type: 'file' },
    { key: 'cover_letter', selector: 'input[type="file"][name*="cover_letter"]', type: 'file' },
    {
      key: 'work_auth',
      selector: '#work_auth_control, [id*="work_authorization"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    // Sponsorship-now/future question — react-select. LIVE-TUNE (label varies:
    // "Will you now or in the future require sponsorship…").
    {
      key: 'requires_sponsorship',
      selector: '#sponsorship_control, [id*="sponsorship"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    // --- EEO / voluntary self-identification (react-selects) ------------------
    // Greenhouse renders these in a demographic section near the bottom of the
    // form. Control ids are stable on the standard template; LIVE-TUNE if a
    // posting hashes them.
    {
      key: 'eeo_gender',
      selector: '#gender_control, [id*="gender"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_race',
      selector: '#race_control, [id*="race"] .select__control, [id*="ethnicity"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_hispanic_latino',
      selector: '#hispanic_ethnicity_control, [id*="hispanic"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_veteran',
      selector: '#veteran_status_control, [id*="veteran"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_disability',
      selector: '#disability_status_control, [id*="disability"] .select__control',
      type: 'react-select',
      strategy: 'react-select',
    },
  ]),
  submit: { selector: 'button[type="submit"], #submit_app', autoClick: false },
}
