import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { getNotifications } from './notificationFeedService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

describe('notificationFeedService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns newest-first notifications scoped to the requested user and groups them by feed type', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'n-1',
          user_id: 'user-1',
          application_id: 'app-1',
          notification_type: 'approval_needed',
          title: 'Approval needed',
          body: 'Please review the submission packet.',
          is_read: false,
          created_at: '2026-06-06T10:30:00.000Z',
        },
        {
          id: 'n-2',
          user_id: 'user-1',
          application_id: 'app-2',
          notification_type: 'stage_change',
          title: 'Stage changed',
          body: 'Application moved to interview_scheduled.',
          is_read: true,
          created_at: '2026-06-06T09:30:00.000Z',
        },
        {
          id: 'n-3',
          user_id: 'user-1',
          application_id: 'app-3',
          notification_type: 'ai_signal',
          title: 'AI signal',
          body: 'New recruiter email classified.',
          is_read: false,
          created_at: '2026-06-06T08:30:00.000Z',
        },
      ],
      error: null,
    })

    const eqUser = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ select }))

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await getNotifications('user-1')

    expect(result.items.map((item) => item.id)).toEqual(['n-1', 'n-2', 'n-3'])
    expect(result.groupedByType.approval.map((item) => item.id)).toEqual(['n-1'])
    expect(result.groupedByType.stage_change.map((item) => item.id)).toEqual(['n-2'])
    expect(result.groupedByType.ai_signal.map((item) => item.id)).toEqual(['n-3'])
    expect(result.unreadCount).toBe(2)
    expect(result.unreadCountByType.approval).toBe(1)
  })
})