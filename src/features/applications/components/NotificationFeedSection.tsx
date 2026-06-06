import { useEffect, useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { getNotifications, type NotificationFeedResult } from '../services/notificationFeedService'
import { buildNotificationFeedSections } from './notificationFeedView'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface NotificationFeedSectionProps {
  refreshKey?: number
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function NotificationFeedSection({ refreshKey = 0 }: NotificationFeedSectionProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [feed, setFeed] = useState<NotificationFeedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void getNotifications(userId)
      .then((data) => { if (!cancelled) { setFeed(data); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load notifications'); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const sections = useMemo(() => (feed ? buildNotificationFeedSections(feed) : []), [feed])
  const unreadCount = feed?.unreadCount ?? 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                Notifications
              </CardTitle>
              <CardDescription className="text-xs">
                Grouped by type, newest first.
              </CardDescription>
            </div>
          </div>
          {unreadCount > 0 && (
            <Badge className="shrink-0 text-xs">{unreadCount} unread</Badge>
          )}
        </div>

        {/* Type chips */}
        {sections.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sections.map((section) => (
              <span
                key={section.group}
                className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
              >
                {section.label}: {section.items.length}
              </span>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && feed === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {sections.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notifications yet.</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.group} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                    <span className="text-xs text-muted-foreground">{section.unreadCount} unread</span>
                  </div>
                  {section.items.map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-lg border p-3 text-sm transition-colors ${item.is_read ? 'bg-background' : 'bg-primary/5 border-primary/20'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${item.is_read ? 'bg-muted-foreground/30' : 'bg-primary'}`}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{item.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatTime(item.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
