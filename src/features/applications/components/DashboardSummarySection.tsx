import { useEffect, useState } from 'react'
import { CalendarDays, Users, Clock, Brain, XCircle } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import type { DashboardMetricsSummary } from '../services/dashboardAnalyticsService'
import { getDashboardMetrics } from '../services/dashboardAnalyticsService'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardSummarySectionProps {
  refreshKey?: number
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatConfidence(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

const METRIC_ICONS = [
  <CalendarDays className="h-4 w-4" />,
  <Users className="h-4 w-4" />,
  <Clock className="h-4 w-4" />,
  <Brain className="h-4 w-4" />,
  <XCircle className="h-4 w-4" />,
]

export function DashboardSummarySection({ refreshKey = 0 }: DashboardSummarySectionProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [metrics, setMetrics] = useState<DashboardMetricsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void getDashboardMetrics(userId)
      .then((data) => { if (!cancelled) { setMetrics(data); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load dashboard'); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const cards = metrics
    ? [
        { label: 'Apps this week', value: formatCount(metrics.applicationsThisWeek), icon: 0 },
        { label: 'Active interviews', value: formatCount(metrics.activeInterviews), icon: 1 },
        { label: 'Pending approvals', value: formatCount(metrics.pendingApprovals), icon: 2 },
        {
          label: 'AI confidence avg',
          value: formatConfidence(metrics.aiConfidenceAverage),
          suffix: metrics.aiConfidenceAverage !== null ? '/100' : undefined,
          icon: 3,
        },
        { label: 'Rejections', value: formatCount(metrics.rejectionCount), icon: 4 },
      ]
    : []

  return (
    // @container: the metric cards reflow on the dashboard column's width rather
    // than the viewport, so the sidebar/drawer state never skews the count (ADR-023).
    <section className="@container">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Real-Time Dashboard
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live pipeline metrics scoped to your account.
          </p>
        </div>
        {metrics && (
          <span className="text-xs text-muted-foreground">
            {new Date(metrics.generatedAtIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5">
        {loading && metrics === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="mb-2 h-3 w-20" />
                  <Skeleton className="h-7 w-14" />
                  <Skeleton className="mt-1.5 h-3 w-16" />
                </CardContent>
              </Card>
            ))
          : cards.map((card) => (
              <Card key={card.label} className="transition-shadow duration-150 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {METRIC_ICONS[card.icon]}
                    {card.label}
                  </div>
                  <div
                    className="text-2xl font-semibold text-foreground"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {card.value}
                    {'suffix' in card && card.suffix && (
                      <span className="ml-1 text-sm text-muted-foreground">{card.suffix}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </section>
  )
}
