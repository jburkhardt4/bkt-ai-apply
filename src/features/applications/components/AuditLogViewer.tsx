import { useEffect, useState } from 'react'
import { ArrowRight, ScrollText } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { type AuditEventRow, fetchAuditLog } from '../services/applicationService'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

interface AuditLogViewerProps {
  applicationId: string
  refreshKey?: number
}

export function AuditLogViewer({ applicationId, refreshKey = 0 }: AuditLogViewerProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !applicationId) return
    let cancelled = false
    void fetchAuditLog(applicationId, userId)
      .then((data) => { if (!cancelled) { setEvents(data); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load audit log'); setLoading(false) } })
    return () => { cancelled = true }
  }, [applicationId, userId, refreshKey])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <h3
          className="text-base font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Audit Log
        </h3>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {loading && events.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events recorded.</p>
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-4">
          {events.map((event) => (
            <li key={event.id} className="relative">
              {/* Timeline dot */}
              <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full border-2 border-background bg-border" />
              <div className="rounded-md border bg-background p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-foreground">{event.event_type}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                {event.from_stage && event.to_stage && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{event.from_stage}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium text-foreground">{event.to_stage}</span>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  actor: <span className="font-medium text-foreground">{event.actor}</span>
                  {event.reason && <span className="ml-1 italic"> · {event.reason}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
