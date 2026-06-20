// BKT Apply-Macro — hard stop-condition detection (pure-ish module).
//
// Scans an ATS page for situations the macro must NEVER try to drive through
// silently: CAPTCHA challenges, MFA / one-time-passcode prompts, and login
// walls. When any are present the content script SURFACES "needs your attention"
// to the human and stands down — it never bypasses, solves, or auto-submits past
// a control (BR-151, MV3 standard-userland only; no engine bridging).
//
// DOM-free at the type level: it accepts anything with `querySelector`, so a real
// `Document` works in the content script AND a minimal fake DOM works in vitest
// (jsdom is not a dependency here). Never throws.

/** The minimal DOM surface this module needs — a real Document satisfies it. */
export interface QueryRoot {
  querySelector(selectors: string): unknown
}

/** Machine-readable stop reasons (stable codes the UI/telemetry can switch on). */
export type StopReason = 'captcha' | 'mfa_otp' | 'login_wall'

export interface StopConditionResult {
  reasons: StopReason[]
}

// CAPTCHA: reCAPTCHA + hCaptcha widget/iframe markers. These are the standard,
// stable hooks both providers render; presence means a human challenge is gating
// submission.
const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  '.g-recaptcha',
  '[data-sitekey]',
  'iframe[src*="hcaptcha"]',
  '.h-captcha',
  '[data-hcaptcha]',
  '[data-hcaptcha-widget-id]',
]

// MFA / OTP: one-time-passcode inputs. autocomplete="one-time-code" is the web
// standard hint; the name/id/inputmode patterns catch common verification-code
// fields that omit it.
const MFA_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[name*="otp" i]',
  'input[id*="otp" i]',
  'input[name*="one-time" i]',
  'input[name*="verification-code" i]',
  'input[name*="verification_code" i]',
  'input[inputmode="numeric"][name*="code" i]',
]

// Login walls: a sign-in form blocking the application. A password input is the
// strongest signal; explicit login/auth containers back it up. (We do NOT treat
// a generic email field as a login wall — application forms collect email too.)
const LOGIN_SELECTORS = [
  'input[type="password"]',
  'form[action*="login" i]',
  'form[action*="signin" i]',
  'form[action*="sign-in" i]',
  '[data-testid*="login" i]',
  '#login-form',
  '.login-required',
]

/** True when any selector in the list matches under `root`. Defensive: a bad
 *  selector or a throwing host querySelector is swallowed, never propagated. */
function anyMatch(root: QueryRoot, selectors: readonly string[]): boolean {
  for (const sel of selectors) {
    try {
      if (root.querySelector(sel)) return true
    } catch {
      // Malformed selector for this engine or a hostile host DOM → ignore.
    }
  }
  return false
}

/**
 * Detects hard stop-conditions on the page. Returns a (possibly empty) list of
 * machine-readable reasons. An empty list means "no blocker detected" — it is
 * NOT a guarantee the page is automatable, only that none of the known walls are
 * present. The caller surfaces any reasons to the human and does not auto-fill
 * past them.
 */
export function detectStopConditions(root: Document | QueryRoot | null | undefined): StopConditionResult {
  const reasons: StopReason[] = []
  if (!root || typeof root.querySelector !== 'function') return { reasons }

  if (anyMatch(root, CAPTCHA_SELECTORS)) reasons.push('captcha')
  if (anyMatch(root, MFA_SELECTORS)) reasons.push('mfa_otp')
  if (anyMatch(root, LOGIN_SELECTORS)) reasons.push('login_wall')

  return { reasons }
}

/** Human-readable label for a stop reason (for the status surface). */
export function describeStopReason(reason: StopReason): string {
  switch (reason) {
    case 'captcha':
      return 'a CAPTCHA challenge'
    case 'mfa_otp':
      return 'a verification-code (MFA) step'
    case 'login_wall':
      return 'a sign-in wall'
    default:
      return 'a manual step'
  }
}
