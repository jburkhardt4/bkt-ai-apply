import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'
import { classifyChatIntent, runChatAssistant } from './chatAssistantService'

vi.mock('../../../lib/ai-router', () => ({
  routeAiTask: vi.fn(),
  logAiUsage: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockRouteAiTask = vi.mocked(routeAiTask)
const mockLogAiUsage = vi.mocked(logAiUsage)
const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

function mockSupabaseContext() {
  const applicationsLimit = vi.fn().mockResolvedValue({
    data: [
      { id: 'app-1', stage: 'applied', match_score: 81, updated_at: '2026-06-06T12:00:00.000Z' },
      { id: 'app-2', stage: 'screening', match_score: 72, updated_at: '2026-06-05T12:00:00.000Z' },
      { id: 'app-3', stage: 'discovery', match_score: null, updated_at: '2026-06-04T12:00:00.000Z' },
    ],
    error: null,
  })
  const applicationsOrder = vi.fn(() => ({ limit: applicationsLimit }))
  const applicationsEq = vi.fn(() => ({ order: applicationsOrder }))
  const applicationsSelect = vi.fn(() => ({ eq: applicationsEq }))

  const aiScoresLimit = vi.fn().mockResolvedValue({
    data: [
      { job_id: 'job-1', overall_score: 85, recommendation: 'apply', scored_at: '2026-06-06T10:00:00.000Z' },
      { job_id: 'job-2', overall_score: 70, recommendation: 'consider', scored_at: '2026-06-05T10:00:00.000Z' },
    ],
    error: null,
  })
  const aiScoresOrder = vi.fn(() => ({ limit: aiScoresLimit }))
  const aiScoresEq = vi.fn(() => ({ order: aiScoresOrder }))
  const aiScoresSelect = vi.fn(() => ({ eq: aiScoresEq }))

  const from = vi.fn((table: string) => {
    if (table === 'applications') {
      return { select: applicationsSelect }
    }

    if (table === 'ai_scores') {
      return { select: aiScoresSelect }
    }

    return { select: vi.fn() }
  })

  mockGetSupabaseClient.mockReturnValue({
    from,
  } as unknown as ReturnType<typeof getSupabaseClient>)

  return {
    applicationsEq,
    aiScoresEq,
  }
}

describe('chatAssistantService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseContext()
  })

  it('classifies intents and routes score explanation through match_scoring after intent_routing', async () => {
    mockRouteAiTask.mockImplementation(async ({ taskType }) => {
      if (taskType === 'intent_routing') {
        return {
          taskType,
          modelName: 'Gemini 2.5 Flash',
          modelProvider: 'google',
          isCritical: false,
          costDecision: {
            monthlySpendUsd: 12,
            status: 'ok',
            shouldBlock: false,
          },
        }
      }

      return {
        taskType,
        modelName: 'Claude Opus 4.6',
        modelProvider: 'anthropic',
        isCritical: false,
        costDecision: {
          monthlySpendUsd: 12,
          status: 'ok',
          shouldBlock: false,
        },
      }
    })

    const result = await runChatAssistant({
      userId: 'user-1',
      applicationId: 'app-1',
      message: 'Can you explain why this score is only 72?',
    })

    expect(classifyChatIntent('Can you explain this score breakdown?')).toBe('score_explanation')
    expect(mockRouteAiTask).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      taskType: 'intent_routing',
    })
    expect(mockRouteAiTask).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      taskType: 'match_scoring',
    })

    expect(result.status).toBe('answered')
    if (result.status === 'answered') {
      expect(result.intent).toBe('score_explanation')
      expect(result.taskType).toBe('match_scoring')
      expect(result.routedModel.modelName).toBe('Claude Opus 4.6')
    }
  })

  it('returns deferred when non-critical response route is capped', async () => {
    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'intent_routing',
      modelName: 'Gemini 2.5 Flash',
      modelProvider: 'google',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 75,
        status: 'ok',
        shouldBlock: false,
      },
    })

    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'general_qa',
      modelName: 'Claude Sonnet 4.6',
      modelProvider: 'anthropic',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 75,
        status: 'capped_non_critical',
        shouldBlock: true,
      },
    })

    const result = await runChatAssistant({
      userId: 'user-1',
      message: 'What should I do next this week?',
    })

    expect(result.status).toBe('deferred')
    if (result.status === 'deferred') {
      expect(result.costStatus).toBe('capped')
      expect(result.costPolicyStatus).toBe('capped_non_critical')
      expect(result.taskType).toBe('general_qa')
      expect(result.monthlySpendUsd).toBe(75)
    }
  })

  it('logs usage for intent routing and response path', async () => {
    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'intent_routing',
      modelName: 'Gemini 2.5 Flash',
      modelProvider: 'google',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 25,
        status: 'ok',
        shouldBlock: false,
      },
    })

    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'cover_letter_generation',
      modelName: 'Claude Opus 4.6',
      modelProvider: 'anthropic',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 25,
        status: 'ok',
        shouldBlock: false,
      },
    })

    await runChatAssistant({
      userId: 'user-1',
      applicationId: 'app-1',
      message: 'Draft a follow up email for a recruiter I spoke with yesterday.',
    })

    expect(mockLogAiUsage).toHaveBeenCalledTimes(2)
    expect(mockLogAiUsage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user_id: 'user-1',
        task_type: 'intent_routing',
        application_id: 'app-1',
      }),
    )
    expect(mockLogAiUsage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        user_id: 'user-1',
        task_type: 'cover_letter_generation',
        application_id: 'app-1',
      }),
    )
  })

  it('enriches responses with scoped pipeline context summary', async () => {
    const { applicationsEq, aiScoresEq } = mockSupabaseContext()

    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'intent_routing',
      modelName: 'Gemini 2.5 Flash',
      modelProvider: 'google',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 30,
        status: 'warn_80',
        shouldBlock: false,
      },
    })

    mockRouteAiTask.mockResolvedValueOnce({
      taskType: 'company_market_research',
      modelName: 'Gemini 2.5 Pro',
      modelProvider: 'google',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 30,
        status: 'warn_80',
        shouldBlock: false,
      },
    })

    const result = await runChatAssistant({
      userId: 'user-1',
      message: 'Suggest strategy and filters for better opportunities.',
    })

    expect(applicationsEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(aiScoresEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result.status).toBe('answered')
    if (result.status === 'answered') {
      expect(result.contextSummary.applicationsTracked).toBe(3)
      expect(result.contextSummary.highMatchCount).toBe(1)
      expect(result.contextSummary.averageMatchScore).toBe(76.5)
      expect(result.contextSummary.recentAiScoreAverage).toBe(77.5)
      expect(result.costStatus).toBe('warn')
      expect(result.taskType).toBe('company_market_research')
    }
  })
})