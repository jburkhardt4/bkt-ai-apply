import { describe, expect, it } from 'vitest'
import { detectStopConditions, describeStopReason, type QueryRoot } from './stopConditions'

/**
 * Minimal fake DOM: a `querySelector` that returns a truthy stub when a CSS
 * selector matches any of the provided "present" selectors, else null. jsdom is
 * NOT a dependency, so the module accepts any `{ querySelector }` and we drive it
 * with this stub (the content script passes the real `document`).
 */
function fakeRoot(present: string[]): QueryRoot {
  const set = new Set(present)
  return {
    querySelector(sel: string): unknown {
      return set.has(sel) ? { matched: sel } : null
    },
  }
}

describe('detectStopConditions', () => {
  it('returns no reasons on a clean application form', () => {
    const root = fakeRoot([])
    expect(detectStopConditions(root).reasons).toEqual([])
  })

  it('detects a reCAPTCHA iframe', () => {
    const root = fakeRoot(['iframe[src*="recaptcha"]'])
    expect(detectStopConditions(root).reasons).toContain('captcha')
  })

  it('detects the .g-recaptcha and [data-sitekey] widgets', () => {
    expect(detectStopConditions(fakeRoot(['.g-recaptcha'])).reasons).toContain('captcha')
    expect(detectStopConditions(fakeRoot(['[data-sitekey]'])).reasons).toContain('captcha')
  })

  it('detects hCaptcha markers', () => {
    expect(detectStopConditions(fakeRoot(['iframe[src*="hcaptcha"]'])).reasons).toContain('captcha')
    expect(detectStopConditions(fakeRoot(['[data-hcaptcha]'])).reasons).toContain('captcha')
  })

  it('detects an MFA / one-time-code input', () => {
    const root = fakeRoot(['input[autocomplete="one-time-code"]'])
    expect(detectStopConditions(root).reasons).toContain('mfa_otp')
  })

  it('detects a login wall via a password input', () => {
    const root = fakeRoot(['input[type="password"]'])
    expect(detectStopConditions(root).reasons).toContain('login_wall')
  })

  it('reports multiple stop conditions at once', () => {
    const root = fakeRoot(['.g-recaptcha', 'input[autocomplete="one-time-code"]', 'input[type="password"]'])
    const { reasons } = detectStopConditions(root)
    expect(reasons).toEqual(expect.arrayContaining(['captcha', 'mfa_otp', 'login_wall']))
    expect(reasons).toHaveLength(3)
  })

  it('is defensive: null/undefined or a non-DOM object never throws', () => {
    expect(detectStopConditions(null).reasons).toEqual([])
    expect(detectStopConditions(undefined).reasons).toEqual([])
    expect(detectStopConditions({} as QueryRoot).reasons).toEqual([])
  })

  it('swallows a throwing querySelector (hostile host DOM)', () => {
    const throwing: QueryRoot = {
      querySelector() {
        throw new Error('boom')
      },
    }
    expect(() => detectStopConditions(throwing)).not.toThrow()
    expect(detectStopConditions(throwing).reasons).toEqual([])
  })

  it('describeStopReason gives human-readable labels', () => {
    expect(describeStopReason('captcha')).toMatch(/CAPTCHA/i)
    expect(describeStopReason('mfa_otp')).toMatch(/verification/i)
    expect(describeStopReason('login_wall')).toMatch(/sign-in/i)
  })
})
