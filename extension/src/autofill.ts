import type { AutofillInput, AutofillReport } from './types'

/**
 * Config-driven autofill macro (spec §4.3).
 *
 * SELF-CONTAINED by design: it references only its argument and DOM globals (no
 * module imports survive at runtime), so the exact same function is injected
 * into an ATS page via Playwright `page.evaluate` in tests and, later, by the
 * MV3 content script. It fills what it can and REPORTS the rest — it never
 * throws on a missing or drifted selector (UAT-2, §5.2 DOM drift), and it NEVER
 * clicks submit (BR-151).
 */
export function applyAutofill(input: AutofillInput): AutofillReport {
  const { config, payload } = input
  const report: AutofillReport = { filled: [], missing: [], skipped: [] }

  // Set value via the native prototype setter so React's controlled inputs see
  // the change (the Jam shows Simplify driving controlled React forms), then
  // dispatch input + change so the page's listeners fire.
  const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  for (const field of config.fields) {
    const el = document.querySelector<HTMLElement>(field.selector)
    if (!el) {
      report.missing.push(field.key)
      continue
    }
    // File inputs cannot be set programmatically (browser security) → the human
    // attaches the resume; we only flag it.
    if (field.type === 'file') {
      report.skipped.push({ key: field.key, reason: 'manual_required' })
      continue
    }
    // Custom widgets need a typed strategy; not yet shipped → report rather than
    // fabricate a wrong selection (§5.2).
    if (field.type === 'react-select' || field.strategy === 'react-select') {
      report.skipped.push({ key: field.key, reason: 'needs_strategy' })
      continue
    }
    const value = payload[field.key]
    if (value === undefined || value === '') {
      report.skipped.push({ key: field.key, reason: 'no_value' })
      continue
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, value)
      el.setAttribute('data-bkt-filled', '1')
      report.filled.push(field.key)
    } else if (el instanceof HTMLSelectElement) {
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.setAttribute('data-bkt-filled', '1')
      report.filled.push(field.key)
    } else {
      report.skipped.push({ key: field.key, reason: 'needs_strategy' })
    }
  }
  return report
}
