import type { AutofillInput, AutofillReport, FieldConfig } from './types'

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

  // Pick the option whose visible text best matches the desired value, WITHOUT
  // ever selecting the wrong one (UAT-4, §5.2). Tiers, most-specific first:
  //   1. exact label  — "Male" matches "Male", never the "Female" that contains
  //      it (plain substring matching mis-selected EEO/gender; this is the fix).
  //   2. unique prefix — handles "U.S. Citizen" ⇄ "U.S. Citizen / National".
  //   3. unique substring — last resort, only when exactly one option contains it.
  // Ambiguous (≥2 candidates, no exact) → null, and we report rather than guess.
  const pickOption = (opts: HTMLElement[], wanted: string): HTMLElement | null => {
    const norm = (o: HTMLElement): string => (o.textContent ?? '').trim().toLowerCase()
    const exact = opts.filter((o) => norm(o) === wanted)
    if (exact.length) return exact[0]
    const prefix = opts.filter((o) => {
      const t = norm(o)
      return t !== '' && (t.startsWith(wanted) || wanted.startsWith(t))
    })
    if (prefix.length === 1) return prefix[0]
    const contains = opts.filter((o) => norm(o).includes(wanted))
    if (contains.length === 1) return contains[0]
    return null
  }

  // react-select strategy: click the control to open the menu, poll briefly for
  // its options to render, then commit the anti-collision match (pickOption).
  const fillReactSelect = async (control: HTMLElement, values: string[]): Promise<boolean> => {
    const wanted = values.map((v) => v.trim().toLowerCase()).filter(Boolean)
    if (!wanted.length) return false
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    control.click()
    // Poll for the menu, then commit the FIRST candidate (preference order) that
    // matches an option — lets an answer carry ≤30-day notice-period fallbacks.
    const option = await waitFor<HTMLElement>(() => {
      const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      if (!opts.length) return null
      for (const w of wanted) {
        const hit = pickOption(opts, w)
        if (hit) return hit
      }
      return null
    })
    if (!option) return false
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    option.click()
    return true
  }

  // ---- B5 label-text fallback matcher (ADR-014 D4) -------------------------
  // Opaque-id ATS templates (Greenhouse's job-boards form keys every field as
  // `#question_<id>`) defeat semantic selectors. When a field's CSS selector
  // misses, locate it by its visible <label> text instead — the only durable
  // signal. NON-SENSITIVE fields only: EEO/work-auth/etc. are never fuzzy-matched
  // → they stay human/review (BR-156). UNAMBIGUOUSLY-or-skip: if two fields could
  // match, we refuse to guess (UAT-4), mirroring pickOption().
  const normText = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const SELECT_CTRL = '[class*="select__control"], .rs-control, [role="combobox"]'
  const isSelect = (f: FieldConfig): boolean =>
    f.type === 'react-select' || f.type === 'select' || f.strategy === 'react-select'

  // Resolve the fillable control from a matched <label>: the react-select control
  // for select fields, the <input>/<textarea> for text fields; null if none fits.
  const controlFromLabel = (label: Element, selectType: boolean): HTMLElement | null => {
    let target: HTMLElement | null = null
    const forId = label.getAttribute('for')
    if (forId) target = document.getElementById(forId)
    if (!target) target = label.querySelector<HTMLElement>(`${SELECT_CTRL}, input, textarea, select`)
    if (!target && label.parentElement) {
      target = label.parentElement.querySelector<HTMLElement>(`${SELECT_CTRL}, input, textarea, select`)
    }
    if (!target) return null
    if (selectType) {
      if (target instanceof HTMLSelectElement) return target
      if (target.matches(SELECT_CTRL)) return target
      const within = target.querySelector<HTMLElement>(SELECT_CTRL)
      if (within) return within
      const up = target.closest<HTMLElement>(SELECT_CTRL)
      if (up) return up
      const container = target.closest<HTMLElement>('[class*="select__"]')
      return container?.querySelector<HTMLElement>(SELECT_CTRL) ?? null
    }
    // A plain text/textarea field. Reject an <input> that is really a react-select's
    // inner search box (its <label> points at it via `for`), so a text-typed answer
    // never types into a choice widget instead of letting a select entry pick an
    // option — this is what makes JB's type-conditional answers safe (B4).
    if (target.closest('[class*="select__"]')) return null
    if (target instanceof HTMLInputElement) {
      return target.type === 'file' || target.type === 'hidden' ? null : target
    }
    return target instanceof HTMLTextAreaElement ? target : null
  }

  // Tier 2 (text fields only): score inputs by their own signal attributes
  // (autocomplete → name → id → aria-label → placeholder). Unambiguous-or-null.
  const locateTextByAttrs = (wants: string[]): HTMLElement | null => {
    const inputs = Array.from(document.querySelectorAll<HTMLElement>('input, textarea')).filter((el) =>
      el instanceof HTMLInputElement ? el.type !== 'file' && el.type !== 'hidden' : true,
    )
    const hits = inputs.filter((el) => {
      const hay = normText(
        [
          el.getAttribute('autocomplete'),
          el.getAttribute('name'),
          el.id,
          el.getAttribute('aria-label'),
          el.getAttribute('placeholder'),
        ]
          .filter(Boolean)
          .join(' '),
      )
      return hay !== '' && wants.some((w) => hay.includes(w))
    })
    return hits.length === 1 ? hits[0] : null
  }

  // Tier 1: match a set of normalized label phrasings to a form <label>/<legend>,
  // then resolve its control. `selectType` picks the react-select / native-select
  // path; text falls back to attribute scoring. Ambiguous select → refuse to guess
  // (UAT-4). Shared by the field path (B5) and the Answer Library path (B4).
  const locateByLabelText = (wants: string[], selectType: boolean): HTMLElement | null => {
    if (!wants.length) return null
    const labels = Array.from(document.querySelectorAll('label, legend'))
    let matches = labels.filter((l) => {
      const t = normText(l.textContent ?? '')
      return t !== '' && wants.some((w) => t.includes(w))
    })
    if (matches.length > 1) {
      // Ambiguous → tie-break to exact label equality; else refuse to guess.
      const exact = matches.filter((l) => wants.includes(normText(l.textContent ?? '')))
      if (exact.length !== 1) return selectType ? null : locateTextByAttrs(wants)
      matches = exact
    }
    if (matches.length === 1) {
      const ctrl = controlFromLabel(matches[0], selectType)
      if (ctrl) return ctrl
    }
    return selectType ? null : locateTextByAttrs(wants)
  }
  const locateByLabel = (field: FieldConfig): HTMLElement | null =>
    locateByLabelText((field.labels ?? []).map(normText).filter(Boolean), isSelect(field))

  for (const field of config.fields) {
    let el = document.querySelector<HTMLElement>(field.selector)
    // Selector missed → try the label-text fallback (non-sensitive only, BR-156).
    if (!el && !field.sensitive && field.labels?.length) {
      el = locateByLabel(field)
    }
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
      const ok = await fillReactSelect(el, [value])
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

  // ---- B4 Master Answers Library pass (ADR-014) ---------------------------
  // Beyond the board's known fields, fill the user's pre-stored standing answers
  // to recurring custom screeners (years-of-skill, certifications, "2+ years X?"…).
  // Each is located by matching its question_label/aliases to the form's <label>
  // text — the opaque `#question_<id>` screeners have no stable selector. Sensitive
  // answers (salary / EEO / work-auth) are NEVER auto-filled — review-gated (BR-156).
  for (const entry of input.answers ?? []) {
    const key = `answer:${entry.questionKey}`
    if (entry.sensitive) {
      report.skipped.push({ key, reason: 'manual_required' })
      continue
    }
    if (!entry.answer || !entry.answer.trim()) {
      report.skipped.push({ key, reason: 'no_value' })
      continue
    }
    const wants = [entry.questionLabel, ...(entry.aliases ?? [])].map(normText).filter(Boolean)
    const choice = entry.answerType === 'select' || entry.answerType === 'boolean'
    const el = locateByLabelText(wants, choice)
    if (!el) {
      report.missing.push(key)
      continue
    }
    if (choice) {
      // Try the stored answer first, then any accept-list fallbacks, in order.
      const candidates = [entry.answer, ...(entry.accept ?? [])]
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
      if (el instanceof HTMLSelectElement) {
        // Native <select>: commit the first candidate that matches (pickOption).
        let opt: HTMLElement | null = null
        for (const c of candidates) {
          opt = pickOption(Array.from(el.options), c)
          if (opt) break
        }
        if (opt instanceof HTMLOptionElement) {
          el.value = opt.value
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.setAttribute('data-bkt-filled', '1')
          report.filled.push(key)
        } else {
          report.skipped.push({ key, reason: 'needs_strategy' })
        }
      } else if (await fillReactSelect(el, candidates)) {
        report.filled.push(key)
      } else {
        report.skipped.push({ key, reason: 'needs_strategy' })
      }
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, entry.answer)
      el.setAttribute('data-bkt-filled', '1')
      report.filled.push(key)
    } else {
      report.skipped.push({ key, reason: 'needs_strategy' })
    }
  }
  return report
}
