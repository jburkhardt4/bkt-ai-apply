import type { BoardConfig } from '../types'

/**
 * Lever field-mapping config — Wave 1. Lever uses a single combined name field
 * (`input[name="name"]`) rather than first/last, and plain text inputs for the
 * rest — a good check that the same config-driven macro handles a different
 * field shape (spec §7).
 *
 * Lever's standard hosted form (`jobs.lever.co/<co>/<id>/apply`) exposes name /
 * email / phone / org / urls[...] as native inputs, the resume as a file input,
 * and its EEO/demographic block as native <select> elements named `eeo[...]`
 * (so they use the macro's plain select strategy, not react-select). Custom
 * screener questions are `cards[...]` inputs whose names are posting-specific —
 * those are left to the human (UAT-4); the macro fills only mapped keys.
 * Selectors marked LIVE-TUNE need a real-posting check.
 */
export const leverConfig: BoardConfig = {
  ats: 'lever',
  version: '2026-06-19',
  match: { hosts: ['jobs.lever.co'] },
  jd: { container: '.posting-description, .content', title: '.posting-headline h2' },
  fields: [
    { key: 'full_name', selector: 'input[name="name"]', type: 'text' },
    { key: 'email', selector: 'input[name="email"]', type: 'email' },
    { key: 'phone', selector: 'input[name="phone"]', type: 'tel' },
    { key: 'linkedin', selector: 'input[name="urls[LinkedIn]"], input[name*="LinkedIn"]', type: 'url' },
    // Lever's "Current location" field (standard on most postings).
    {
      key: 'location',
      selector: 'input[name="location"], input[name*="location"]',
      type: 'text',
    },
    // Portfolio / personal-site URL question. LIVE-TUNE (label varies).
    {
      key: 'website',
      selector:
        'input[name="urls[Portfolio]"], input[name="urls[Website]"], input[name*="Portfolio"], input[name*="Website"]',
      type: 'url',
    },
    { key: 'resume', selector: 'input[type="file"][name="resume"]', type: 'file' },
    // --- EEO / demographic (Lever uses native <select name="eeo[...]">) --------
    { key: 'eeo_gender', selector: 'select[name="eeo[gender]"], select[name*="gender"]', type: 'select' },
    {
      key: 'eeo_race',
      selector: 'select[name="eeo[race]"], select[name*="race"], select[name*="ethnicity"]',
      type: 'select',
    },
    {
      key: 'eeo_veteran',
      selector: 'select[name="eeo[veteran]"], select[name*="veteran"]',
      type: 'select',
    },
    {
      key: 'eeo_disability',
      selector: 'select[name="eeo[disability]"], select[name*="disability"]',
      type: 'select',
    },
  ],
  submit: { selector: 'button[type="submit"], .template-btn-submit', autoClick: false },
}
