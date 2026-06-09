import { describe, expect, it } from 'vitest'
import {
  CHAT_MODEL_CATALOG,
  DEFAULT_CHAT_MODEL_NAME,
  evaluateAiCostPolicy,
  getChatModelOption,
  getModelPricing,
  resolveChatModel,
} from './ai-router'

const PROVIDERS = ['anthropic', 'openai', 'google'] as const

describe('evaluateAiCostPolicy', () => {
  it('returns ok below warning threshold', () => {
    const decision = evaluateAiCostPolicy(10, false)
    expect(decision.status).toBe('ok')
    expect(decision.shouldBlock).toBe(false)
  })

  it('returns 80 percent warning at 60 dollars', () => {
    const decision = evaluateAiCostPolicy(60, false)
    expect(decision.status).toBe('warn_80')
    expect(decision.shouldBlock).toBe(false)
  })

  it('returns 90 percent warning at 67.5 dollars', () => {
    const decision = evaluateAiCostPolicy(67.5, false)
    expect(decision.status).toBe('warn_90')
    expect(decision.shouldBlock).toBe(false)
  })

  it('blocks non-critical tasks at cap', () => {
    const decision = evaluateAiCostPolicy(75, false)
    expect(decision.status).toBe('capped_non_critical')
    expect(decision.shouldBlock).toBe(true)
  })

  it('allows critical tasks at cap', () => {
    const decision = evaluateAiCostPolicy(75, true)
    expect(decision.status).toBe('capped_critical_override')
    expect(decision.shouldBlock).toBe(false)
  })
})

describe('CHAT_MODEL_CATALOG', () => {
  it('is non-empty and every entry uses a known provider', () => {
    expect(CHAT_MODEL_CATALOG.length).toBeGreaterThan(0)
    for (const option of CHAT_MODEL_CATALOG) {
      expect(PROVIDERS).toContain(option.provider)
      expect(option.modelName.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('uses unique model names', () => {
    const names = CHAT_MODEL_CATALOG.map((m) => m.modelName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes the default chat model', () => {
    expect(getChatModelOption(DEFAULT_CHAT_MODEL_NAME)).toBeDefined()
  })

  it('covers all three providers', () => {
    const providers = new Set(CHAT_MODEL_CATALOG.map((m) => m.provider))
    expect(providers).toEqual(new Set(PROVIDERS))
  })
})

describe('resolveChatModel', () => {
  it('falls back to the default for null/undefined', () => {
    expect(resolveChatModel(null).modelName).toBe(DEFAULT_CHAT_MODEL_NAME)
    expect(resolveChatModel(undefined).modelName).toBe(DEFAULT_CHAT_MODEL_NAME)
  })

  it('falls back to the default for an unknown model name', () => {
    const resolved = resolveChatModel('Totally Made Up Model')
    expect(resolved.modelName).toBe(DEFAULT_CHAT_MODEL_NAME)
  })

  it('honors a known override and returns its provider', () => {
    const resolved = resolveChatModel('GPT-4o')
    expect(resolved.modelName).toBe('GPT-4o')
    expect(resolved.modelProvider).toBe('openai')
  })
})

describe('getModelPricing', () => {
  it('returns positive rates for a known model', () => {
    const pricing = getModelPricing('Claude Sonnet 4.6')
    expect(pricing.inputUsdPerToken).toBeGreaterThan(0)
    expect(pricing.outputUsdPerToken).toBeGreaterThan(0)
  })

  it('returns a non-zero fallback for an unknown model', () => {
    const pricing = getModelPricing('Unknown Model X')
    expect(pricing.inputUsdPerToken).toBeGreaterThan(0)
    expect(pricing.outputUsdPerToken).toBeGreaterThan(0)
  })
})