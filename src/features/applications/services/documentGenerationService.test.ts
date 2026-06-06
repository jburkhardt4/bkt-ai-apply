import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCoverLetter, generateResumeVariant } from './documentGenerationService'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'

vi.mock('../../../lib/ai-router', () => ({
  routeAiTask: vi.fn(),
  logAiUsage: vi.fn(),
}))

const mockRouteAiTask = vi.mocked(routeAiTask)
const mockLogAiUsage = vi.mocked(logAiUsage)

const baseInput = {
  userId: 'user-1',
  applicationId: 'app-1',
  jobTitle: 'Senior AI Engineer',
  companyName: 'Acme Corp',
  jobDescription: 'building reliable production AI systems',
  masterProfile: '10+ years shipping enterprise automation and analytics systems',
  highlights: ['Reduced cycle time by 40%', 'Improved model quality with robust evals'],
  nowIso: '2026-06-05T00:00:00.000Z',
  usageOverride: {
    tokensIn: 1200,
    tokensOut: 900,
    estimatedCostUsd: 0.12,
  },
}

describe('document generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns queued for non-critical generation when AI cost cap blocks dispatch', async () => {
    mockRouteAiTask.mockResolvedValue({
      taskType: 'resume_rewriting',
      modelName: 'GPT-5',
      modelProvider: 'openai',
      isCritical: false,
      costDecision: {
        monthlySpendUsd: 75,
        status: 'capped_non_critical',
        shouldBlock: true,
      },
    })

    const result = await generateResumeVariant(baseInput)

    expect(result).toEqual({
      status: 'queued',
      reason: 'Monthly AI cost cap reached for non-critical task.',
      taskType: 'resume_rewriting',
      costPolicyStatus: 'capped_non_critical',
      monthlySpendUsd: 75,
    })
    expect(mockLogAiUsage).not.toHaveBeenCalled()
  })

  it('routes resume and cover-letter generation through canonical task types and models', async () => {
    mockRouteAiTask.mockImplementation(async ({ taskType }) => {
      if (taskType === 'resume_rewriting') {
        return {
          taskType,
          modelName: 'GPT-5',
          modelProvider: 'openai',
          isCritical: false,
          costDecision: {
            monthlySpendUsd: 15,
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
          monthlySpendUsd: 15,
          status: 'ok',
          shouldBlock: false,
        },
      }
    })

    const resumeResult = await generateResumeVariant(baseInput)
    const coverResult = await generateCoverLetter(baseInput)

    expect(mockRouteAiTask).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      taskType: 'resume_rewriting',
    })
    expect(mockRouteAiTask).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      taskType: 'cover_letter_generation',
    })

    expect(resumeResult.status).toBe('generated')
    if (resumeResult.status === 'generated') {
      expect(resumeResult.document.metadata.modelName).toBe('GPT-5')
      expect(resumeResult.document.metadata.modelProvider).toBe('openai')
      expect(resumeResult.document.metadata.taskType).toBe('resume_rewriting')
    }

    expect(coverResult.status).toBe('generated')
    if (coverResult.status === 'generated') {
      expect(coverResult.document.metadata.modelName).toBe('Claude Opus 4.6')
      expect(coverResult.document.metadata.modelProvider).toBe('anthropic')
      expect(coverResult.document.metadata.taskType).toBe('cover_letter_generation')
    }

    expect(mockLogAiUsage).toHaveBeenNthCalledWith(1, {
      user_id: 'user-1',
      model_provider: 'openai',
      model_name: 'GPT-5',
      task_type: 'resume_rewriting',
      tokens_in: 1200,
      tokens_out: 900,
      estimated_cost_usd: 0.12,
      application_id: 'app-1',
    })

    expect(mockLogAiUsage).toHaveBeenNthCalledWith(2, {
      user_id: 'user-1',
      model_provider: 'anthropic',
      model_name: 'Claude Opus 4.6',
      task_type: 'cover_letter_generation',
      tokens_in: 1200,
      tokens_out: 900,
      estimated_cost_usd: 0.12,
      application_id: 'app-1',
    })
  })
})