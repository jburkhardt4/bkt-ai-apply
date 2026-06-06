import { describe, expect, it } from 'vitest'
import { buildChatAssistantMeta, formatChatCostStatus } from './chatAssistantPanelView'

describe('chatAssistantPanelView', () => {
  it('formats deferred responses with cap-focused status text', () => {
    const deferredStatus = formatChatCostStatus({
      status: 'deferred',
      answerText: 'Deferred',
      deferredReason: 'cap',
      intent: 'general_qa',
      taskType: 'general_qa',
      routedModel: {
        modelName: 'Claude Sonnet 4.6',
        modelProvider: 'anthropic',
      },
      costStatus: 'capped',
      costPolicyStatus: 'capped_non_critical',
      monthlySpendUsd: 75,
      contextSummary: {
        applicationsTracked: 0,
        averageMatchScore: null,
        highMatchCount: 0,
        stageCounts: {},
        recentAiScoreAverage: null,
      },
    })

    expect(deferredStatus).toBe('Deferred at cap')
  })

  it('builds metadata rows for answered responses', () => {
    const metadata = buildChatAssistantMeta({
      status: 'answered',
      answerText: 'hello',
      intent: 'score_explanation',
      taskType: 'match_scoring',
      routedModel: {
        modelName: 'Claude Opus 4.6',
        modelProvider: 'anthropic',
      },
      costStatus: 'warn',
      costPolicyStatus: 'warn_80',
      monthlySpendUsd: 66.23,
      contextSummary: {
        applicationsTracked: 12,
        averageMatchScore: 75,
        highMatchCount: 4,
        stageCounts: { screening: 3 },
        recentAiScoreAverage: 74,
      },
    })

    expect(metadata).toEqual(
      expect.arrayContaining([
        { label: 'Task type', value: 'Match Scoring' },
        { label: 'Intent', value: 'Score Explanation' },
        { label: 'Model', value: 'Claude Opus 4.6' },
        { label: 'Provider', value: 'anthropic' },
        { label: 'Cost status', value: 'Warning threshold (warn_80)' },
      ]),
    )
  })
})