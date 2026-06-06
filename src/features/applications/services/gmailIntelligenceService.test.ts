import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'
import { transitionStage } from './applicationService'
import { processGmailSignal } from './gmailIntelligenceService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('../../../lib/ai-router', () => ({
  routeAiTask: vi.fn(),
  logAiUsage: vi.fn(),
}))

vi.mock('./applicationService', () => ({
  transitionStage: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)
const mockRouteAiTask = vi.mocked(routeAiTask)
const mockLogAiUsage = vi.mocked(logAiUsage)
const mockTransitionStage = vi.mocked(transitionStage)

describe('gmailIntelligenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteAiTask.mockResolvedValue({
      taskType: 'email_classification',
      modelName: 'Gemini 2.5 Flash',
      modelProvider: 'google',
      isCritical: true,
      costDecision: {
        monthlySpendUsd: 0,
        status: 'ok',
        shouldBlock: false,
      },
    })
    mockLogAiUsage.mockResolvedValue()
  })

  it('stores low-confidence classifications without auto-transition (BR-030)', async () => {
    const emailInsert = vi.fn().mockResolvedValue({ error: null })
    const notificationInsert = vi.fn().mockResolvedValue({ error: null })
    const selectSingle = vi.fn().mockResolvedValue({
      data: { id: 'app-1', stage: 'applied' },
      error: null,
    })
    const eqUser = vi.fn(() => ({ single: selectSingle }))
    const eqApp = vi.fn(() => ({ eq: eqUser }))
    const select = vi.fn(() => ({ eq: eqApp }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') return { select }
      if (table === 'emails') return { insert: emailInsert }
      if (table === 'notifications') return { insert: notificationInsert }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await processGmailSignal({
      userId: 'user-1',
      applicationId: 'app-1',
      gmailMessageId: 'gmail-1',
      fromAddress: 'recruiter@example.com',
      subject: 'Quick question',
      bodySnippet: 'Please confirm receipt of this note.',
      receivedAtIso: '2026-06-06T10:00:00.000Z',
    })

    expect(result.confidence).toBeLessThan(0.7)
    expect(result.autoActioned).toBe(false)
    expect(mockTransitionStage).not.toHaveBeenCalled()
    expect(emailInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_actioned: false,
        classification: 'follow_up',
      }),
    )
    expect(notificationInsert).toHaveBeenCalledTimes(1)
  })

  it('prevents rejection auto-overwrite when current stage is offer (BR-012)', async () => {
    const emailInsert = vi.fn().mockResolvedValue({ error: null })
    const notificationInsert = vi.fn().mockResolvedValue({ error: null })
    const selectSingle = vi.fn().mockResolvedValue({
      data: { id: 'app-1', stage: 'offer' },
      error: null,
    })
    const eqUser = vi.fn(() => ({ single: selectSingle }))
    const eqApp = vi.fn(() => ({ eq: eqUser }))
    const select = vi.fn(() => ({ eq: eqApp }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') return { select }
      if (table === 'emails') return { insert: emailInsert }
      if (table === 'notifications') return { insert: notificationInsert }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await processGmailSignal({
      userId: 'user-1',
      applicationId: 'app-1',
      gmailMessageId: 'gmail-2',
      fromAddress: 'talent@company.com',
      subject: 'Unfortunately we are not moving forward',
      bodySnippet: 'We regret to inform you that we selected another candidate.',
      receivedAtIso: '2026-06-06T10:30:00.000Z',
    })

    expect(result.classification).toBe('rejection')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.autoActioned).toBe(false)
    expect(result.reason.toLowerCase()).toContain('offer-stage protection')
    expect(mockTransitionStage).not.toHaveBeenCalled()
  })

  it('transitions on high-confidence interview invite and creates notification', async () => {
    const emailInsert = vi.fn().mockResolvedValue({ error: null })
    const notificationInsert = vi.fn().mockResolvedValue({ error: null })
    const selectSingle = vi.fn().mockResolvedValue({
      data: { id: 'app-2', stage: 'screening' },
      error: null,
    })
    const eqUser = vi.fn(() => ({ single: selectSingle }))
    const eqApp = vi.fn(() => ({ eq: eqUser }))
    const select = vi.fn(() => ({ eq: eqApp }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') return { select }
      if (table === 'emails') return { insert: emailInsert }
      if (table === 'notifications') return { insert: notificationInsert }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    mockTransitionStage.mockResolvedValue()

    const result = await processGmailSignal({
      userId: 'user-1',
      applicationId: 'app-2',
      gmailMessageId: 'gmail-3',
      fromAddress: 'recruiter@company.com',
      subject: 'Interview schedule and calendar invite',
      bodySnippet: 'Please share your availability for the technical screen interview.',
      receivedAtIso: '2026-06-06T11:00:00.000Z',
    })

    expect(result.classification).toBe('interview_invite')
    expect(result.autoActioned).toBe(true)
    expect(result.transitionedToStage).toBe('interview_scheduled')
    expect(mockTransitionStage).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-2',
        userId: 'user-1',
        fromStage: 'screening',
        toStage: 'interview_scheduled',
        actor: 'gmail_scraper',
      }),
    )
    expect(emailInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_actioned: true,
      }),
    )
    expect(notificationInsert).toHaveBeenCalledTimes(1)
  })
})