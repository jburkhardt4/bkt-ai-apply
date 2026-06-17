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
 *
 * Async because custom widgets (react-select) open a menu on click and render
 * their options a tick later; the macro polls briefly for the matching option.
 */
export async function applyAutofill(input: AutofillInput): Promise<AutofillReport> {
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

  // Poll for a value (e.g. a react-select option appearing) up to a short budget.
  const waitFor = async <T>(predicate: () => T | null, timeoutMs = 600, stepMs = 25): Promise<T | null> => {
    const start = Date.now()
    for (;;) {
      const hit = predicate()
      if (hit) return hit
      if (Date.now() - start >= timeoutMs) return null
      await new Promise((res) => setTimeout(res, stepMs))
    }
  }

  // react-select strategy: click the control to open the menu, then click the
  // option whose visible text matches the desired value. Exact-ish: matches an
  // option whose text contains the value (case-insensitive) so we never select
  // the wrong option silently — if none matches, we report rather than guess.
  const fillReactSelect = async (control: HTMLElement, value: string): Promise<boolean> => {
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    control.click()
    const wanted = value.trim().toLowerCase()
    const option = await waitFor<HTMLElement>(() => {
      const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      return opts.find((o) => (o.textContent ?? '').trim().toLowerCase().includes(wanted)) ?? null
    })
    if (!option) return false
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    option.click()
    return true
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

    const value = payload[field.key]

    if (field.type === 'react-select' || field.strategy === 'react-select') {
      if (value === undefined || value === '') {
        report.skipped.push({ key: field.key, reason: 'no_value' })
        continue
      }
      const ok = await fillReactSelect(el, value)
      if (ok) report.filled.push(field.key)
      else report.skipped.push({ key: field.key, reason: 'needs_strategy' })
      continue
    }

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
