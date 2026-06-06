import { describe, expect, it } from 'vitest'
import { buildNotificationFeedSections, getNotificationGroupLabel } from './notificationFeedView'

describe('notificationFeedView', () => {
  it('labels known notification groups and sorts sections by most recent activity', () => {
    expect(getNotificationGroupLabel('stage_change')).toBe('Stage changes')
    expect(getNotificationGroupLabel('ai_signal')).toBe('AI signals')

    const sections = buildNotificationFeedSections({
      items: [],
      unreadCount: 3,
      unreadCountByType: {
        ai_signal: 1,
        stage_change: 1,
        approval: 1,
        interview: 0,
        other: 0,
      },
      groupedByType: {
        stage_change: [
          {
            id: 'n-2',
            user_id: 'user-1',
            application_id: 'app-2',
            notification_type: 'stage_change',
            title: 'Stage moved',
            body: 'Moved to screening.',
            is_read: true,
            created_at: '2026-06-06T09:30:00.000Z',
            feedGroup: 'stage_change',
          },
        ],
        ai_signal: [
          {
            id: 'n-1',
            user_id: 'user-1',
            application_id: 'app-1',
            notification_type: 'ai_signal',
            title: 'AI signal',
            body: 'New recruiter email classified.',
            is_read: false,
            created_at: '2026-06-06T10:30:00.000Z',
            feedGroup: 'ai_signal',
          },
        ],
        approval: [
          {
            id: 'n-3',
            user_id: 'user-1',
            application_id: 'app-3',
            notification_type: 'approval_needed',
            title: 'Approval needed',
            body: 'Review packet.',
            is_read: false,
            created_at: '2026-06-06T08:30:00.000Z',
            feedGroup: 'approval',
          },
        ],
        interview: [],
        other: [],
      },
    })

    expect(sections.map((section) => section.group)).toEqual(['ai_signal', 'stage_change', 'approval'])
    expect(sections[0]?.label).toBe('AI signals')
    expect(sections[0]?.items[0]?.id).toBe('n-1')
  })
})