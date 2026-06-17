import type { BoardConfig } from '../types'

/**
 * Ashby field-mapping config — Wave 1. Ashby's apply form is React-heavy: a
 * combined name field and a react-select for work authorization, exercising the
 * macro's react-select strategy on a second board. Matches jobs.ashbyhq.com and
 * any *.ashbyhq.com subdomain via resolveBoardConfig (spec §7).
 */
export const ashbyConfig: BoardConfig = {
  ats: 'ashby',
  version: '2026-06-17',
  match: { hosts: ['jobs.ashbyhq.com', 'ashbyhq.com'] },
  jd: { container: '[class*="description"], ._description', title: 'h1' },
  fields: [
    { key: 'full_name', selector: 'input[name="_systemfield_name"], input[aria-label="Name"]', type: 'text' },
    { key: 'email', selector: 'input[name="_systemfield_email"], input[type="email"]', type: 'email' },
    { key: 'linkedin', selector: 'input[aria-label*="LinkedIn"], input[name*="linkedin"]', type: 'url' },
    {
      key: 'work_auth',
      selector: '#ashby_work_auth_control',
      type: 'react-select',
      strategy: 'react-select',
    },
    { key: 'resume', selector: 'input[type="file"]', type: 'file' },
  ],
  submit: { selector: 'button[type="submit"]', autoClick: false },
}
