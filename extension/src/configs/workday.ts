import type { BoardConfig } from '../types'

/**
 * Workday field-mapping config — Wave 2 (best-effort, HIGH DRIFT).
 *
 * ⚠️ EVERY SELECTOR HERE IS UNCERTAIN / LIVE-TUNE. Workday is a multi-step wizard
 * (Create Account → My Information → My Experience → Application Questions →
 * Voluntary Disclosures → Self-Identify → Review) rendered as a heavily-nested,
 * tenant-customized SPA. There is NO single application form: the macro runs
 * against whichever step is currently on screen, fills the fields it finds, and
 * reports the rest (not_found) — the human advances each step (BR-151, UAT-4).
 *
 * Selectors target Workday's `data-automation-id` attributes, which are the most
 * stable hooks Workday exposes, but they STILL vary by tenant/version. Treat
 * this config as a starting point for live tuning, not a verified mapping. Hosts
 * cover both the candidate portal (`*.myworkdayjobs.com`) and tenant instances
 * (`*.workday.com`).
 *
 * Field-type notes:
 *  - Workday "dropdowns" are NOT native <select> and NOT react-select. They are
 *    custom button+listbox widgets (a <button data-automation-id=...> that opens
 *    a popup <ul role="listbox">). The macro's react-select strategy (click to
 *    open, then click the option whose text matches) is the closest fit and is
 *    used for them here — but this is the highest-risk part and needs live
 *    verification; several may fall back to needs_strategy.
 *  - The resume is a file input on the My Experience step → manual_required.
 */
export const workdayConfig: BoardConfig = {
  ats: 'workday',
  version: '2026-06-19',
  match: { hosts: ['myworkdayjobs.com', 'workday.com'] },
  // UNCERTAIN: the JD lives on the posting page (before the wizard). These target
  // the common job-details automation ids; LIVE-TUNE.
  jd: {
    container: '[data-automation-id="jobPostingDescription"], [data-automation-id="job-details"]',
    title: '[data-automation-id="jobPostingHeader"], h1',
  },
  fields: [
    // --- My Information: legal name (UNCERTAIN — tenant-customized) -----------
    { key: 'first_name', selector: '[data-automation-id="legalNameSection_firstName"]', type: 'text' },
    { key: 'last_name', selector: '[data-automation-id="legalNameSection_lastName"]', type: 'text' },
    // Preferred name lives behind a "I have a preferred name" checkbox on some
    // tenants → the input may not be present until toggled. UNCERTAIN.
    {
      key: 'preferred_name',
      selector: '[data-automation-id="preferredNameSection_firstName"]',
      type: 'text',
    },
    // --- Contact (UNCERTAIN) --------------------------------------------------
    { key: 'email', selector: '[data-automation-id="email"], input[type="email"]', type: 'email' },
    {
      key: 'phone',
      selector: '[data-automation-id="phone-number"], [data-automation-id="phoneNumber"]',
      type: 'tel',
    },
    // Country phone code + phone device type are custom listbox widgets. UNCERTAIN.
    {
      key: 'phone_country',
      selector: '[data-automation-id="countryPhoneCode"] button, [data-automation-id="country-phone-code"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    // --- Address (UNCERTAIN) --------------------------------------------------
    {
      key: 'location',
      selector: '[data-automation-id="addressSection_city"]',
      type: 'text',
    },
    // State/region is a custom listbox on US tenants. UNCERTAIN.
    {
      key: 'state',
      selector:
        '[data-automation-id="addressSection_countryRegion"] button, [data-automation-id="countryRegion"] button',
      type: 'react-select',
      strategy: 'react-select',
    },
    // --- My Experience: links + resume (UNCERTAIN) ----------------------------
    {
      key: 'linkedin',
      selector: '[data-automation-id="linkedinQuestion"], input[aria-label*="LinkedIn"]',
      type: 'url',
    },
    {
      key: 'website',
      selector: '[data-automation-id="websiteQuestion"], input[aria-label*="Website"]',
      type: 'url',
    },
    // Resume → file input; macro flags manual_required (the human attaches it).
    {
      key: 'resume',
      selector: '[data-automation-id="file-upload-input-ref"], input[type="file"]',
      type: 'file',
    },
    // --- Application Questions: work auth + sponsorship (custom listboxes) ----
    // UNCERTAIN — these are tenant-authored questions; the automation ids below
    // are common but not guaranteed. They are listbox widgets → react-select fit.
    {
      key: 'work_auth',
      selector: '[data-automation-id="workAuthorization"] button, [aria-label*="authorized to work"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'requires_sponsorship',
      selector: '[data-automation-id="sponsorship"] button, [aria-label*="sponsorship"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    // --- Voluntary Disclosures / Self-Identify: EEO (custom listboxes) --------
    // UNCERTAIN — Workday splits these across the Voluntary Disclosures and
    // Self-Identify steps; automation ids vary by tenant + region.
    {
      key: 'eeo_gender',
      selector: '[data-automation-id="gender"] button, [aria-label*="Gender"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_race',
      selector:
        '[data-automation-id="ethnicity"] button, [data-automation-id="race"] button, [aria-label*="Race"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_hispanic_latino',
      selector: '[data-automation-id="hispanicOrLatino"] button, [aria-label*="Hispanic"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_veteran',
      selector: '[data-automation-id="veteranStatus"] button, [aria-label*="Veteran"]',
      type: 'react-select',
      strategy: 'react-select',
    },
    {
      key: 'eeo_disability',
      selector: '[data-automation-id="disabilityStatus"] button, [aria-label*="Disability"]',
      type: 'react-select',
      strategy: 'react-select',
    },
  ],
  // UNCERTAIN: Workday's advance control is a per-step "Continue"/"Submit"
  // button, NOT a single form submit. autoClick stays false (BR-151) — the
  // human advances + submits every step.
  submit: {
    selector: '[data-automation-id="pageFooterNextButton"], [data-automation-id="bottom-navigation-next-button"], button[type="submit"]',
    autoClick: false,
  },
}
