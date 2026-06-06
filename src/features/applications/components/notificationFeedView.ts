import type { NotificationFeedGroup, NotificationFeedItem, NotificationFeedResult } from '../services/notificationFeedService'

export interface NotificationFeedSectionView {
  group: NotificationFeedGroup
  label: string
  items: NotificationFeedItem[]
  unreadCount: number
  latestCreatedAtIso: string
}

const GROUP_LABELS: Record<NotificationFeedGroup, string> = {
  stage_change: 'Stage changes',
  ai_signal: 'AI signals',
  approval: 'Approvals',
  interview: 'Interviews',
  other: 'Other updates',
}

const GROUP_PRIORITY: Record<NotificationFeedGroup, number> = {
  stage_change: 0,
  ai_signal: 1,
  approval: 2,
  interview: 3,
  other: 4,
}

export function getNotificationGroupLabel(group: NotificationFeedGroup): string {
  return GROUP_LABELS[group]
}

function parseIsoOrZero(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function buildNotificationFeedSections(feed: NotificationFeedResult): NotificationFeedSectionView[] {
  return Object.entries(feed.groupedByType)
    .map(([group, items]) => {
      const typedGroup = group as NotificationFeedGroup
      const latestItem = items[0]

      return {
        group: typedGroup,
        label: getNotificationGroupLabel(typedGroup),
        items,
        unreadCount: feed.unreadCountByType[typedGroup],
        latestCreatedAtIso: latestItem?.created_at ?? '',
      }
    })
    .filter((section) => section.items.length > 0)
    .sort((left, right) => {
      const rightTime = parseIsoOrZero(right.latestCreatedAtIso)
      const leftTime = parseIsoOrZero(left.latestCreatedAtIso)

      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }

      return GROUP_PRIORITY[left.group] - GROUP_PRIORITY[right.group]
    })
}