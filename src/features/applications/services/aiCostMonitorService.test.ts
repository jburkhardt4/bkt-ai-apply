import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { getAiCostStatus, getMonthlyAiSpendSummary } from './aiCostMonitorService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

describe('aiCostMonitorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'))
  })

  it('summarizes spend by provider, model, and task type with threshold status', async () => {
    const gte = vi.fn().mockResolvedValue({
      data: [
        {
          estimated_cost_usd: 20,
          model_name: 'Claude Opus 4.6',
          model_provider: 'anthropic',
          task_type: 'match_scoring',
        },
        {
          estimated_cost_usd: 35,
          model_name: 'Gemini 2.5 Flash',
          model_provider: 'google',
          task_type: 'email_classification',
        },
        {
          estimated_cost_usd: 17,
          model_name: 'GPT-5',
          model_provider: 'openai',
          task_type: 'resume_rewriting',
        },
      ],
      error: null,
    })
    const eq = vi.fn(() => ({ gte }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const summary = await getMonthlyAiSpendSummary('user-1')

    expect(summary.monthStartIso).toBe('2026-06-01T00:00:00.000Z')
    expect(summary.monthlySpendUsd).toBe(72)
    expect(summary.policyStatus).toBe('warn_90')
    expect(summary.shouldBlockNonCritical).toBe(false)
    expect(summary.thresholdStatus).toEqual({
      reached80Percent: true,
      reached90Percent: true,
      reachedCap: false,
    })
    expect(summary.spendByProvider).toEqual([
      { key: 'google', spendUsd: 35, shareOfMonthlySpend: 48.6 },
      { key: 'anthropic', spendUsd: 20, shareOfMonthlySpend: 27.8 },
      { key: 'openai', spendUsd: 17, shareOfMonthlySpend: 23.6 },
    ])
    expect(summary.spendByTaskType[0]).toEqual({
      key: 'email_classification',
      spendUsd: 35,
      shareOfMonthlySpend: 48.6,
    })
  })

  it('returns a blocked banner when spend reaches the cap', async () => {
    const gte = vi.fn().mockResolvedValue({
      data: [
        {
          estimated_cost_usd: 75,
          model_name: 'Gemini 2.5 Flash',
          model_provider: 'google',
          task_type: 'email_classification',
        },
      ],
      error: null,
    })
    const eq = vi.fn(() => ({ gte }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const status = await getAiCostStatus('user-1')

    expect(status.bannerState).toBe('blocked')
    expect(status.bannerTitle).toContain('cap')
    expect(status.summary.thresholdStatus.reachedCap).toBe(true)
  })
})