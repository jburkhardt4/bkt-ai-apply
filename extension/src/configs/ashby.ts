import type { BoardConfig } from '../types'

/**
 * Ashby field-mapping config — Wave 1. Ashby's apply form is React-heavy: a
 * combined name field and react-select widgets for choice fields, exercising the
 * macro's react-select strategy on a second board. Matches jobs.ashbyhq.com and
 * any *.ashbyhq.com subdomain via resolveBoardConfig (spec §7).
 *
 * Ashby renders system fields with `_systemfield_*` names and custom + EEO
 * questions as react-selects whose container ids are HASHED per posting — so
 * almost every non-system selector here is best-effort via aria-label / name
 * contains and is marked LIVE-TUNE. The stable `#ashby_*_control` ids are the
 * fixture's deterministic stand-ins for the hashed live controls.
 */
export const ashbyConfig: BoardConfig = {
  ats: 'ashby',
  version: '2026-06-19',
  match: { hosts: ['jobs.ashbyhq.com', 'ashbyhq.com'] },
  jd: { container: '[class*="description"], ._description', title: 'h1' },
  fields: [
    { key: 'full_name', selector: 'input[name="_systemfield_name"], input[aria-label="Name"]', type: 'text' },
    // Preferred name — custom question on many Ashby forms. LIVE-TUNE.
    {
      key: 'preferred_name',
      selector: 'input[aria-label*="Preferred"], input[name*="preferred"]',
      type: 'text',
    },
    { key: 'email', selector: 'input[name="_systemfield_email"], input[type="email"]', type: 'email' },
    // Ashby phone is a native input plus a country react-select on some forms.
    { key: 'phone', selector: 'input[name="_systemfield_phone"], input[type="tel"]', type: 'tel' },
    { key: 'linkedin', selector: 'input[aria-label*="LinkedIn"], input[name*="linkedin"]', type: 'url' },
    // Website / portfolio — custom URL question. LIVE-TUNE.
    {
      key: 'website',
      selector: 'input[aria-label*="Website"], input[aria-label*="Portfolio"], input[name*="website"]',
      type: 'url',
    },
    // Location — Ashby uses a location autocomplete; plain text on simpler forms. LIVE-TUNE.
    {
      key: 'location',
      selector: 'input[aria-label*="Location"], input[name*="_systemfield_location"], input[name*="location"]',
      type: 'text',
    },
    {
      key: 'work_auth',
      selector: '#ashby_work_auth_control',
      type: 'react-select',
      strategy: 'react-select',
    },
    // Sponsorship react-select. LIVE-TUNE (Ashby hashes the container id).
    {
      key: 'requires_sponsorship',
      selector: '#ashby_sponsorship_control, [aria-label*="sponsorship"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    // --- EEO / demographic (Ashby react-selects; ids hashed → LIVE-TUNE) ------
    {
      key: 'eeo_gender',
      selector: '#ashby_gender_control, [aria-label*="Gender"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_race',
      selector: '#ashby_race_control, [aria-label*="Race"], [aria-label*="Ethnicity"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_veteran',
      selector: '#ashby_veteran_control, [aria-label*="Veteran"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_disability',
      selector: '#ashby_disability_control, [aria-label*="Disability"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    { key: 'resume', selector: 'input[type="file"]', type: 'file' },
  ],
  submit: { selector: 'button[type="submit"]', autoClick: false },
}
