// BKT Apply-Macro — native ATS quick-apply detection (B7, ADR-014 follow-on).
//
// Some ATSes offer an ACCOUNT-BASED "quick apply" that fills the form from the
// candidate's existing account on that platform — Greenhouse's "Apply with
// MyGreenhouse", LinkedIn "Easy Apply", "Apply with Indeed", Workday "Autofill
// with Resume". The live UAT (Jam 2e14758d) showed that when the user already
// has that account, the native button fills fields ours can't — including the
// opaque-`#question_<id>` and review-gated ones. So we DETECT and SURFACE it as a
// recommended accelerator.
//
// We NEVER click it (no auto-click): the native button opens an OAuth / sign-in
// popup, which is an auth boundary the human must cross themselves (BR-151,
// BR-122 — the extension holds no platform credentials). We only inform.
//
// SELF-CONTAINED by design: each exported function references only its arguments
// and DOM globals — every constant and helper lives INSIDE the function body — so
// the exact same function works when esbuild bundles it into the MV3 content
// script AND when Playwright injects it standalone via `page.evaluate` (which
// stringifies the function, dropping any module-scope refs). Never throws.

export type NativeApplyProvider = 'greenhouse' | 'linkedin' | 'indeed' | 'workday'

export interface NativeApplyOption {
  provider: NativeApplyProvider
  /** The control's own visible text, e.g. "Quick Apply with MyGreenhouse". */
  label: string
}

/**
 * Scans the page for native account-based quick-apply controls and returns one
 * option per detected provider (deduped, in signature order). An empty array
 * means none were found — NOT that the page lacks an apply flow. Read-only: it
 * never clicks, focuses, or mutates anything.
 */
export function detectNativeApply(doc: Document | null | undefined = document): NativeApplyOption[] {
  const found: NativeApplyOption[] = []
  if (!doc || typeof doc.querySelectorAll !== 'function') return found

  // Signatures, most-specific phrasing first. Patterns are deliberately tight so a
  // plain "LinkedIn" profile link or a generic "Apply" submit never trips a false
  // positive — only the account-based accelerators match. This order is also the
  // order options are returned (stable, one per provider).
  const signatures: { provider: NativeApplyProvider; patterns: RegExp[] }[] = [
    { provider: 'greenhouse', patterns: [/my\s*greenhouse/i, /apply with greenhouse/i] },
    { provider: 'linkedin', patterns: [/easy apply/i, /apply with linkedin/i] },
    { provider: 'indeed', patterns: [/indeed apply/i, /apply with indeed/i] },
    { provider: 'workday', patterns: [/autofill with resume/i, /use my last application/i] },
  ]
  // Clickable controls a native quick-apply renders as (anchors need an href; a
  // bare <a> is not an action). Excludes nothing host-specific.
  const clickableSel = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]'
  // Our own injected UI — never detect the extension's buttons as native apply.
  const ownUiSel = '#bkt-apply-root, #bkt-fit-panel, #bkt-native-apply'

  // Visible text of a control: textContent for buttons/anchors, value for inputs,
  // plus aria-label / title. Whitespace-collapsed; '' when there is none.
  const controlText = (el: Element): string => {
    const own = el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')
    const aria = el.getAttribute('aria-label') ?? ''
    const title = el.getAttribute('title') ?? ''
    return `${own} ${aria} ${title}`.replace(/\s+/g, ' ').trim()
  }

  const view = doc.defaultView ?? null
  // Best-effort visibility — skip display:none / visibility:hidden / [hidden] /
  // type=hidden. Any failure is treated as visible (never drop a real button).
  const isHidden = (el: Element): boolean => {
    try {
      if (el instanceof HTMLElement && el.hidden) return true
      if (el instanceof HTMLInputElement && el.type === 'hidden') return true
      const cs = view?.getComputedStyle(el)
      return cs ? cs.display === 'none' || cs.visibility === 'hidden' : false
    } catch {
      return false
    }
  }

  let controls: Element[]
  try {
    controls = Array.from(doc.querySelectorAll(clickableSel))
  } catch {
    return found
  }

  for (const { provider, patterns } of signatures) {
    for (const el of controls) {
      if (el.closest(ownUiSel)) continue // skip our own injected controls
      if (isHidden(el)) continue
      const text = controlText(el)
      if (text && patterns.some((p) => p.test(text))) {
        found.push({ provider, label: text })
        break // one option per provider
      }
    }
  }
  return found
}

/**
 * Renders (or, with an empty list, removes) the recommendation note that points
 * the user at a detected native quick-apply. Idempotent — re-rendering replaces
 * the prior note. Self-positioned bottom-right (#bkt-native-apply) so it never
 * collides with the top-right Match-Score panel stack and survives panel
 * re-renders. It only NAMES the button; the human clicks it themselves (BR-151).
 */
export function renderNativeApplyNote(options: NativeApplyOption[]): void {
  const NOTE_ID = 'bkt-native-apply'
  document.getElementById(NOTE_ID)?.remove()
  if (!options.length) return

  const providerNames: Record<NativeApplyProvider, string> = {
    greenhouse: 'Greenhouse',
    linkedin: 'LinkedIn',
    indeed: 'Indeed',
    workday: 'Workday',
  }

  const note = document.createElement('div')
  note.id = NOTE_ID
  note.setAttribute('data-bkt', 'native-apply')
  note.setAttribute('role', 'note')

  const title = document.createElement('div')
  title.setAttribute('data-bkt', 'native-title')
  title.textContent = 'Faster: native quick-apply available'
  note.appendChild(title)

  const ul = document.createElement('ul')
  for (const opt of options) {
    const li = document.createElement('li')
    li.setAttribute('data-provider', opt.provider)
    li.textContent = `“${opt.label}” — fills from your ${providerNames[opt.provider]} account`
    ul.appendChild(li)
  }
  note.appendChild(ul)

  const hint = document.createElement('div')
  hint.setAttribute('data-bkt', 'native-hint')
  hint.textContent =
    'Click it yourself to sign in, then review before submitting — we never click it for you.'
  note.appendChild(hint)

  document.body.appendChild(note)
}
