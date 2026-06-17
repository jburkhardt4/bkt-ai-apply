import type { BoardConfig } from '../types'

/**
 * Lever field-mapping config — Wave 1. Lever uses a single combined name field
 * (`input[name="name"]`) rather than first/last, and plain text inputs for the
 * rest — a good check that the same config-driven macro handles a different
 * field shape (spec §7).
 */
export const leverConfig: BoardConfig = {
  ats: 'lever',
  version: '2026-06-17',
  match: { hosts: ['jobs.lever.co'] },
  jd: { container: '.posting-description, .content', title: '.posting-headline h2' },
  fields: [
    { key: 'full_name', selector: 'input[name="name"]', type: 'text' },
    { key: 'email', selector: 'input[name="email"]', type: 'email' },
    { key: 'phone', selector: 'input[name="phone"]', type: 'tel' },
    { key: 'linkedin', selector: 'input[name="urls[LinkedIn]"], input[name*="LinkedIn"]', type: 'url' },
    { key: 'resume', selector: 'input[type="file"][name="resume"]', type: 'file' },
  ],
  submit: { selector: 'button[type="submit"], .template-btn-submit', autoClick: false },
}
