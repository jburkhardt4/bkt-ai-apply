import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { getDashboardMetrics } from './dashboardAnalyticsService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

describe('dashboardAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'))
  })

  it('aggregates dashboard metrics from scoped application, interview, and notification data', async () => {
    const applicationsEq = vi.fn().mockResolvedValue({
      data: [
        { created_at: '2026-06-03T10:00:00.000Z', match_score: 82, stage: 'screening' },
        { created_at: '2026-06-05T10:00:00.000Z', match_score: 74, stage: 'rejected' },
        { created_at: '2026-05-29T10:00:00.000Z', match_score: null, stage: 'applied' },
      ],
      error: null,
    })
    const applicationsSelect = vi.fn(() => ({ eq: applicationsEq }))

    const interviewsIn = vi.fn().mockResolvedValue({ count: 2, error: null })
    const interviewsEq = vi.fn(() => ({ in: interviewsIn }))
    const interviewsSelect = vi.fn(() => ({ eq: interviewsEq }))

    const notificationsEqUnread = vi.fn().mockResolvedValue({ count: 3, error: null })
    const notificationsEqRead = vi.fn(() => ({ eq: notificationsEqUnread }))
    const notificationsEqType = vi.fn(() => ({ eq: notificationsEqRead }))
    const notificationsSelect = vi.fn(() => ({ eq: notificationsEqType }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') {
        return { select: applicationsSelect }
      }

      if (table === 'interviews') {
        return { select: interviewsSelect }
      }

      if (table === 'notifications') {
        return { select: notificationsSelect }
      }

      return { select: vi.fn() }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await getDashboardMetrics('user-1')

    expect(result.applicationsThisWeek).toBe(2)
    expect(result.activeInterviews).toBe(2)
    expect(result.pendingApprovals).toBe(3)
    expect(result.aiConfidenceAverage).toBe(78)
    expect(result.rejectionCount).toBe(1)
    expect(result.weekStartIso).toBe('2026-06-01T00:00:00.000Z')
  })
})