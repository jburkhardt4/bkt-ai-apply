import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import { getNotifications, type NotificationFeedResult } from '../services/notificationFeedService'
import { buildNotificationFeedSections } from './notificationFeedView'

interface NotificationFeedSectionProps {
  refreshKey?: number
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
      .then((data) => {
        if (!cancelled) {
          setFeed(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notifications')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  const sections = useMemo(() => (feed ? buildNotificationFeedSections(feed) : []), [feed])

  if (loading && feed === null) {
    return <div style={{ marginTop: '1rem', color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>Loading notifications…</div>
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        border: '1px solid var(--line)',
        borderRadius: '18px',
        padding: '1rem',
        background: 'var(--surface)',
        boxShadow: '0 12px 28px rgba(7, 16, 27, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.05rem', color: 'var(--ink-strong)' }}>
            Notification Feed
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-subtle)', fontSize: '0.82rem' }}>
            Read-only, newest-first notifications grouped by type.
          </p>
        </div>
        <span
          style={{
            borderRadius: '999px',
            padding: '0.24rem 0.55rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.18)',
            color: '#1d4ed8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {feed?.unreadCount ?? 0} unread
        </span>
      </div>

      {error && <div style={{ color: '#dc2626', marginTop: '0.85rem', fontSize: '0.82rem' }}>{error}</div>}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.45rem',
          marginTop: '0.85rem',
        }}
      >
        {sections.map((section) => (
          <span
            key={section.group}
            style={{
              border: '1px solid var(--line)',
              borderRadius: '999px',
              padding: '0.28rem 0.55rem',
              fontSize: '0.76rem',
              color: 'var(--ink-subtle)',
              background: '#fff',
            }}
          >
            {section.label}: {section.items.length}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.75rem' }}>
        {sections.length === 0 ? (
          <div style={{ color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>No notifications yet.</div>
        ) : (
          sections.map((section) => (
            <section
              key={section.group}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '16px',
                padding: '0.85rem',
                background: 'rgba(255,255,255,0.92)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-strong)' }}>{section.label}</h3>
                <span style={{ color: 'var(--ink-subtle)', fontSize: '0.74rem' }}>
                  {section.unreadCount} unread · newest first
                </span>
              </div>

              <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.7rem' }}>
                {section.items.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: '12px',
                      padding: '0.72rem',
                      background: item.is_read ? '#fff' : '#f8fbff',
                      display: 'grid',
                      gap: '0.3rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', minWidth: 0 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: '0.55rem',
                            height: '0.55rem',
                            marginTop: '0.34rem',
                            borderRadius: '999px',
                            background: item.is_read ? 'rgba(79, 99, 118, 0.35)' : '#2563eb',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.84rem' }}>
                            {item.title}
                          </div>
                          <div style={{ color: 'var(--ink-subtle)', fontSize: '0.76rem', lineHeight: 1.45, marginTop: '0.18rem' }}>
                            {item.body}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: 'var(--ink-subtle)', fontSize: '0.73rem', flexShrink: 0 }}>
                        {formatTime(item.created_at)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  )
}