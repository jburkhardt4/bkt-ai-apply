import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'

type NotificationRow = Database['public']['Tables']['notifications']['Row']

export type NotificationFeedGroup = 'ai_signal' | 'stage_change' | 'approval' | 'interview' | 'other'

export interface NotificationFeedItem extends NotificationRow {
  feedGroup: NotificationFeedGroup
}

export interface NotificationFeedResult {
  items: NotificationFeedItem[]
  groupedByType: Record<NotificationFeedGroup, NotificationFeedItem[]>
  unreadCount: number
  unreadCountByType: Record<NotificationFeedGroup, number>
}

function toFeedGroup(notificationType: string): NotificationFeedGroup {
  if (notificationType === 'ai_signal') {
    return 'ai_signal'
  }

  if (notificationType === 'stage_change') {
    return 'stage_change'
  }

  if (notificationType === 'approval_needed' || notificationType === 'approval') {
    return 'approval'
  }

  if (notificationType === 'interview' || notificationType.startsWith('interview_')) {
    return 'interview'
  }

  return 'other'
}

function emptyFeedGroups(): Record<NotificationFeedGroup, NotificationFeedItem[]> {
  return {
    ai_signal: [],
    stage_change: [],
    approval: [],
    interview: [],
    other: [],
  }
}

function emptyUnreadCounts(): Record<NotificationFeedGroup, number> {
  return {
    ai_signal: 0,
    stage_change: 0,
    approval: 0,
    interview: 0,
    other: 0,
  }
}

export async function getNotifications(userId: string): Promise<NotificationFeedResult> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, application_id, notification_type, title, body, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load notifications: ${error.message}`)
  }

  const groupedByType = emptyFeedGroups()
  const unreadCountByType = emptyUnreadCounts()
  let unreadCount = 0

  const items = (data ?? []).map((row) => {
    const feedGroup = toFeedGroup(row.notification_type)
    const item: NotificationFeedItem = {
      ...row,
      feedGroup,
    }

    groupedByType[feedGroup].push(item)

    if (!row.is_read) {
      unreadCount += 1
      unreadCountByType[feedGroup] += 1
    }

    return item
  })

  return {
    items,
    groupedByType,
    unreadCount,
    unreadCountByType,
  }
}