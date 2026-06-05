import { describe, expect, it } from 'vitest'
import { evaluateAiCostPolicy } from './ai-router'

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