import { describe, expect, it } from 'vitest'
import { buildScoringDecision, getScoreLabel, toDbRecommendation } from './aiScoringService'

describe('AI scoring thresholds', () => {
  it('maps score below 60 to Reject', () => {
    expect(getScoreLabel(59)).toBe('Reject')
    expect(toDbRecommendation(59)).toBe('reject')
  })

  it('maps score from 60 to 79 to Consideration', () => {
    expect(getScoreLabel(60)).toBe('Consideration')
    expect(getScoreLabel(79)).toBe('Consideration')
    expect(toDbRecommendation(60)).toBe('consider')
  })

  it('maps score from 80 to Auto-Submit Prep', () => {
    expect(getScoreLabel(80)).toBe('Auto-Submit Prep')
    expect(toDbRecommendation(80)).toBe('apply')
  })
})

describe('AI scoring cap behavior', () => {
  it('queues scoring when non-critical cost cap blocks dispatch', () => {
    const decision = buildScoringDecision({
      overallScore: 88,
      isBlockedByCap: true,
    })

    expect(decision.label).toBe('Auto-Submit Prep')
    expect(decision.recommendation).toBe('apply')
    expect(decision.shouldQueueForCostCap).toBe(true)
  })

  it('does not queue when cap is not blocking', () => {
    const decision = buildScoringDecision({
      overallScore: 72,
      isBlockedByCap: false,
    })

    expect(decision.label).toBe('Consideration')
    expect(decision.recommendation).toBe('consider')
    expect(decision.shouldQueueForCostCap).toBe(false)
  })
})