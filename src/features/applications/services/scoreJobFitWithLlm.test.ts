import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scoreJobFitWithLlm } from './aiScoringService'
import { getModelPricing, logAiUsage, routeAiTask } from '../../../lib/ai-router'
import { getSupabaseClient } from '../../../lib/supabase'
import type { MatchResult } from '../../../types/pipeline'

vi.mock('../../../lib/ai-router', () => ({
  routeAiTask: vi.fn(),
  logAiUsage: vi.fn(),
  getModelPricing: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockRouteAiTask = vi.mocked(routeAiTask)
const mockLogAiUsage = vi.mocked(logAiUsage)
const mockGetModelPricing = vi.mocked(getModelPricing)
const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

const invoke = vi.fn()
const insert = vi.fn()

const heuristicMatch: MatchResult = {
  overall: 55,
  threshold: 80,
  thresholdPassed: false,
  breakdown: { skills: 18, domain: 10, seniority: 10, tools: 8, locationAuth: 9 },
  strengths: ['salesforce'],
  gaps: ['mulesoft'],
}

const baseInput = {
  userId: 'user-1',
  jobId: 'job-1',
  job: { title: 'Salesforce Architect' },
  profile: { fullName: 'John Burkhardt' },
  heuristicMatch,
  heuristicReasoningTrace: { rule_refs: ['BR-020'] },
  applicationId: 'app-1',
}

function route(shouldBlock: boolean) {
  return {
    taskType: 'match_scoring' as const,
    modelName: 'Claude Opus 4.6',
    modelProvider: 'anthropic' as const,
    isCritical: false,
    costDecision: {
      monthlySpendUsd: shouldBlock ? 75 : 10,
      status: shouldBlock ? ('capped_non_critical' as const) : ('ok' as const),
      shouldBlock,
    },
  }
}

describe('scoreJobFitWithLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insert.mockResolvedValue({ error: null })
    mockGetSupabaseClient.mockReturnValue({
      functions: { invoke },
      from: () => ({ insert }),
    } as never)
    mockGetModelPricing.mockReturnValue({
      inputUsdPerToken: 15 / 1_000_000,
      outputUsdPerToken: 75 / 1_000_000,
    })
  })

  it('persists the LLM score on Edge Function success and maps sub-scores', async () => {
    mockRouteAiTask.mockResolvedValue(route(false))
    invoke.mockResolvedValue({
      data: {
        score: {
          overall_score: 84,
          skills_score: 90,
          domain_score: 80,
          seniority_score: 85,
          tools_score: 70,
          location_auth_score: 88,
          recommendation: 'apply',
          strengths: ['salesforce', 'architecture'],
          gaps: ['lwc'],
          reasoning_trace: { skills: 'strong' },
        },
        usage: { input_tokens: 1000, output_tokens: 400 },
      },
      error: null,
    })

    const result = await scoreJobFitWithLlm(baseInput)

    expect(invoke).toHaveBeenCalledWith('score-job-fit', {
      body: { provider: 'anthropic', model: 'Claude Opus 4.6', job: baseInput.job, profile: baseInput.profile },
    })
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.source).toBe('llm')
      expect(result.overallScore).toBe(84)
      // BR-021: overall >= 80 → apply / Auto-Submit Prep (derived, not the model's field).
      expect(result.decision.recommendation).toBe('apply')
      expect(result.decision.label).toBe('Auto-Submit Prep')
    }

    // ai_scores insert carries the LLM sub-scores + the model reasoning_trace.
    const insertArg = insert.mock.calls[0][0]
    expect(insertArg.overall_score).toBe(84)
    expect(insertArg.skills_score).toBe(90)
    expect(insertArg.location_auth_score).toBe(88)
    expect(insertArg.reasoning_trace).toEqual({ skills: 'strong' })

    // Usage logged with real tokens priced via getModelPricing.
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1)
    const usageArg = mockLogAiUsage.mock.calls[0][0]
    expect(usageArg.tokens_in).toBe(1000)
    expect(usageArg.tokens_out).toBe(400)
    // 1000*15e-6 + 400*75e-6 = 0.045
    expect(usageArg.estimated_cost_usd).toBeCloseTo(0.045, 6)
  })

  it('falls back to the heuristic (flagged) when the Edge Function errors', async () => {
    mockRouteAiTask.mockResolvedValue(route(false))
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await scoreJobFitWithLlm(baseInput)

    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.source).toBe('heuristic_fallback')
      expect(result.overallScore).toBe(55)
    }
    const insertArg = insert.mock.calls[0][0]
    expect(insertArg.overall_score).toBe(55)
    expect(insertArg.reasoning_trace).toMatchObject({
      source: 'heuristic_fallback',
      reason: 'edge_function_error',
    })
    // Heuristic logs zero-cost usage (no LLM call).
    expect(mockLogAiUsage.mock.calls[0][0].estimated_cost_usd).toBe(0)
  })

  it('queues (heuristic fallback) without invoking the Edge Function under the cost cap', async () => {
    mockRouteAiTask.mockResolvedValue(route(true))

    const result = await scoreJobFitWithLlm(baseInput)

    expect(invoke).not.toHaveBeenCalled()
    expect(result.status).toBe('queued')
    if (result.status === 'queued') {
      expect(result.source).toBe('heuristic_fallback')
      expect(result.overallScore).toBe(55)
    }
    // persistAiScore re-routes, sees the cap, and never inserts/logs.
    expect(insert).not.toHaveBeenCalled()
    expect(mockLogAiUsage).not.toHaveBeenCalled()
  })
})
