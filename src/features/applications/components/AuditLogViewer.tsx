import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import {
  type AuditEventRow,
  fetchAuditLog,
} from '../services/applicationService'

interface AuditLogViewerProps {
  applicationId: string
}

export function AuditLogViewer({ applicationId }: AuditLogViewerProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !applicationId) return

    let cancelled = false

    void fetchAuditLog(applicationId, userId)
      .then((data) => {
        if (!cancelled) {
          setEvents(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load audit log')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [applicationId, userId])

  if (loading && events.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>
        Loading audit log…
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          margin: '0 0 0.75rem',
          fontSize: '1rem',
          color: 'var(--ink-strong)',
        }}
      >
        Audit Log
      </h3>

      {error && (
        <div style={{ color: '#dc2626', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>
          No events recorded.
        </div>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {events.map((event) => (
            <li
              key={event.id}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '0.6rem 0.75rem',
                background: '#fff',
                fontSize: '0.82rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--ink-strong)' }}>
                  {event.event_type}
                </span>
                <span style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem', flexShrink: 0 }}>
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </div>

              {event.from_stage && event.to_stage && (
                <div style={{ color: 'var(--ink)', marginTop: '0.2rem' }}>
                  <span style={{ color: 'var(--ink-subtle)' }}>{event.from_stage}</span>
                  {' → '}
                  <span style={{ fontWeight: 600 }}>{event.to_stage}</span>
                </div>
              )}

              <div style={{ marginTop: '0.25rem', color: 'var(--ink-subtle)' }}>
                actor:{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{event.actor}</span>
                {event.reason && (
                  <>
                    {' · '}
                    <span style={{ fontStyle: 'italic' }}>{event.reason}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
