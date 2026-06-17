import type { BoardConfig } from '../types'

/**
 * Greenhouse field-mapping config — Wave 1 (the board in the Jam recording).
 * Selectors follow Greenhouse's standard application form. `work_auth` is a
 * react-select widget, so it carries the explicit strategy and is left for the
 * human until that strategy ships (spec §3.2/§7).
 */
export const greenhouseConfig: BoardConfig = {
  ats: 'greenhouse',
  version: '2026-06-17',
  match: { hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'] },
  jd: { container: '#content, .job__description', title: 'h1.app-title' },
  fields: [
    { key: 'first_name', selector: '#first_name', type: 'text' },
    { key: 'last_name', selector: '#last_name', type: 'text' },
    { key: 'email', selector: '#email', type: 'email' },
    { key: 'phone', selector: '#phone', type: 'tel' },
    {
      key: 'linkedin',
      selector: 'input[name*="urls"][name*="LinkedIn"], input[name*="linkedin"]',
      type: 'url',
    },
    { key: 'resume', selector: 'input[type="file"][name*="resume"]', type: 'file' },
    { key: 'work_auth', selector: '#work_authorization', type: 'react-select', strategy: 'react-select' },
  ],
  submit: { selector: 'button[type="submit"], #submit_app', autoClick: false },
}
