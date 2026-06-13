import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCoverLetter, generateResumeVariant } from './documentGenerationService'
import { getModelPricing, logAiUsage, routeAiTask } from '../../../lib/ai-router'
import { getSupabaseClient } from '../../../lib/supabase'
import { createDocumentVersion } from './documentStorageService'

vi.mock('../../../lib/ai-router', () => ({
  routeAiTask: vi.fn(),
  logAiUsage: vi.fn(),
  getModelPricing: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('./documentStorageService', () => ({
  createDocumentVersion: vi.fn(),
}))

const mockRouteAiTask = vi.mocked(routeAiTask)
const mockLogAiUsage = vi.mocked(logAiUsage)
const mockGetModelPricing = vi.mocked(getModelPricing)
const mockGetSupabaseClient = vi.mocked(getSupabaseClient)
const mockCreateDocumentVersion = vi.mocked(createDocumentVersion)

const invoke = vi.fn()

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

function okRoute(taskType: 'resume_rewriting' | 'cover_letter_generation') {
  if (taskType === 'resume_rewriting') {
    return {
      taskType,
      modelName: 'GPT-5',
      modelProvider: 'openai' as const,
      isCritical: false,
      costDecision: { monthlySpendUsd: 15, status: 'ok' as const, shouldBlock: false },
    }
  }
  return {
    taskType,
    modelName: 'Claude Opus 4.6',
    modelProvider: 'anthropic' as const,
    isCritical: false,
    costDecision: { monthlySpendUsd: 15, status: 'ok' as const, shouldBlock: false },
  }
}

describe('document generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSupabaseClient.mockReturnValue({ functions: { invoke } } as never)
    mockGetModelPricing.mockReturnValue({
      inputUsdPerToken: 5 / 1_000_000,
      outputUsdPerToken: 15 / 1_000_000,
    })
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
    expect(invoke).not.toHaveBeenCalled()
    expect(mockLogAiUsage).not.toHaveBeenCalled()
  })

  it('uses the LLM content + real usage and routes via canonical task types/models', async () => {
    mockRouteAiTask.mockImplementation(async ({ taskType }) => okRoute(taskType as 'resume_rewriting'))
    invoke.mockResolvedValue({
      data: { content: 'REAL LLM RESUME', usage: { input_tokens: 1000, output_tokens: 500 } },
      error: null,
    })

    const resumeResult = await generateResumeVariant(baseInput)
    const coverResult = await generateCoverLetter(baseInput)

    expect(invoke).toHaveBeenNthCalledWith(1, 'generate-document', {
      body: expect.objectContaining({
        provider: 'openai',
        model: 'GPT-5',
        documentType: 'resume',
        masterProfile: baseInput.masterProfile,
      }),
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'generate-document', {
      body: expect.objectContaining({
        provider: 'anthropic',
        model: 'Claude Opus 4.6',
        documentType: 'cover_letter',
      }),
    })

    expect(resumeResult.status).toBe('generated')
    if (resumeResult.status === 'generated') {
      expect(resumeResult.document.content).toBe('REAL LLM RESUME')
      expect(resumeResult.document.metadata.source).toBe('llm')
      expect(resumeResult.document.metadata.modelName).toBe('GPT-5')
      // Real usage priced via getModelPricing: 1000*5e-6 + 500*15e-6 = 0.0125
      expect(resumeResult.document.metadata.usage.estimatedCostUsd).toBeCloseTo(0.0125, 6)
    }

    expect(coverResult.status).toBe('generated')
    if (coverResult.status === 'generated') {
      expect(coverResult.document.metadata.modelProvider).toBe('anthropic')
      expect(coverResult.document.metadata.taskType).toBe('cover_letter_generation')
    }

    // Usage logged with the real token counts (not the override).
    expect(mockLogAiUsage).toHaveBeenNthCalledWith(1, {
      user_id: 'user-1',
      model_provider: 'openai',
      model_name: 'GPT-5',
      task_type: 'resume_rewriting',
      tokens_in: 1000,
      tokens_out: 500,
      estimated_cost_usd: expect.any(Number),
      application_id: 'app-1',
    })
  })

  it('falls back to the template builder + estimateUsage when the Edge Function errors', async () => {
    mockRouteAiTask.mockResolvedValue(okRoute('resume_rewriting'))
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await generateResumeVariant(baseInput)

    expect(result.status).toBe('generated')
    if (result.status === 'generated') {
      expect(result.document.metadata.source).toBe('template_fallback')
      expect(result.document.content).toContain('Targeted Resume Variant')
      // usageOverride is honored on the fallback path.
      expect(result.document.metadata.usage).toEqual(baseInput.usageOverride)
    }
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1)
  })

  it('persists the generated document when persist=true', async () => {
    mockRouteAiTask.mockResolvedValue(okRoute('resume_rewriting'))
    invoke.mockResolvedValue({
      data: { content: 'REAL LLM RESUME', usage: { input_tokens: 10, output_tokens: 5 } },
      error: null,
    })
    mockCreateDocumentVersion.mockResolvedValue({
      documentId: 'doc-1',
      documentType: 'resume',
      version: 1,
      storagePath: 'user-1/resume/v1.txt',
      contentHash: 'abc',
      isLocked: false,
      createdAt: '2026-06-05T00:00:00.000Z',
      content: 'REAL LLM RESUME',
    })

    const result = await generateResumeVariant({ ...baseInput, persist: true })

    expect(mockCreateDocumentVersion).toHaveBeenCalledWith({
      userId: 'user-1',
      documentType: 'resume',
      content: 'REAL LLM RESUME',
    })
    expect(result.status).toBe('generated')
    if (result.status === 'generated') {
      expect(result.document.metadata.storedDocument?.documentId).toBe('doc-1')
    }
  })

  it('does NOT persist when persist is unset (submission-packet flow)', async () => {
    mockRouteAiTask.mockResolvedValue(okRoute('resume_rewriting'))
    invoke.mockResolvedValue({
      data: { content: 'REAL LLM RESUME', usage: { input_tokens: 10, output_tokens: 5 } },
      error: null,
    })

    await generateResumeVariant(baseInput)

    expect(mockCreateDocumentVersion).not.toHaveBeenCalled()
  })
})
