import { describe, expect, it } from 'vitest'
import { parseProviderStatus } from './providerStatusService'

describe('parseProviderStatus', () => {
  it('maps explicit booleans through', () => {
    const status = parseProviderStatus({ anthropic: true, openai: false, google: true })
    expect(status).toEqual({ anthropic: true, openai: false, google: true })
  })

  it('defaults every provider to false for empty/null input', () => {
    expect(parseProviderStatus(null)).toEqual({
      anthropic: false,
      openai: false,
      google: false,
    })
    expect(parseProviderStatus({})).toEqual({
      anthropic: false,
      openai: false,
      google: false,
    })
  })

  it('treats non-true (truthy) values as not configured', () => {
    // Only a strict boolean true counts as configured — never leak ambiguity.
    const status = parseProviderStatus({ anthropic: 'yes', openai: 1, google: {} })
    expect(status).toEqual({ anthropic: false, openai: false, google: false })
  })

  it('ignores unknown keys', () => {
    const status = parseProviderStatus({ anthropic: true, mistral: true })
    expect(status).toEqual({ anthropic: true, openai: false, google: false })
  })
})
