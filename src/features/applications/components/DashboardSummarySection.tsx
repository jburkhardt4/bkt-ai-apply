import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import type { DashboardMetricsSummary } from '../services/dashboardAnalyticsService'
import { getDashboardMetrics } from '../services/dashboardAnalyticsService'

interface DashboardSummarySectionProps {
  refreshKey?: number
}

interface SummaryCard {
  label: string
  value: string
  detail: string
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatConfidence(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function buildSummaryCards(metrics: DashboardMetricsSummary): SummaryCard[] {
  return [
    {
      label: 'Applications this week',
      value: formatCount(metrics.applicationsThisWeek),
      detail: `Week starting ${new Date(metrics.weekStartIso).toLocaleDateString()}`,
    },
    {
      label: 'Active interviews',
      value: formatCount(metrics.activeInterviews),
      detail: 'Scheduled or rescheduled interview records',
    },
    {
      label: 'Pending approvals',
      value: formatCount(metrics.pendingApprovals),
      detail: 'Unread approval-needed notifications',
    },
    {
      label: 'AI confidence average',
      value: formatConfidence(metrics.aiConfidenceAverage),
      detail: 'Average application match score',
    },
    {
      label: 'Rejections',
      value: formatCount(metrics.rejectionCount),
      detail: 'Applications currently in rejected stage',
    },
  ]
}

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
      .then((data) => {
        if (!cancelled) {
          setMetrics(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard summary')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  if (loading && metrics === null) {
    return <div style={{ marginTop: '1rem', color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>Loading dashboard…</div>
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        border: '1px solid var(--line)',
        borderRadius: '18px',
        padding: '1rem',
        background:
          'linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(248,251,255,0.98) 54%, rgba(255,248,243,0.96) 100%)',
        boxShadow: '0 12px 28px rgba(7, 16, 27, 0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.05rem', color: 'var(--ink-strong)' }}>
            Real-Time Dashboard
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-subtle)', fontSize: '0.82rem' }}>
            Live pipeline metrics scoped to your account.
          </p>
        </div>
        {metrics && (
          <span style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem' }}>
            Updated {new Date(metrics.generatedAtIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginTop: '0.85rem', fontSize: '0.82rem' }}>{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.75rem',
          marginTop: '0.9rem',
        }}
      >
        {(metrics ? buildSummaryCards(metrics) : []).map((card) => (
          <div
            key={card.label}
            style={{
              border: '1px solid var(--line)',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.9)',
              padding: '0.8rem',
              minHeight: '90px',
            }}
          >
            <div style={{ fontSize: '0.74rem', color: 'var(--ink-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {card.label}
            </div>
            <div style={{ marginTop: '0.3rem', fontFamily: 'var(--font-display)', fontSize: '1.55rem', color: 'var(--ink-strong)' }}>
              {card.value}
              {card.label === 'AI confidence average' && card.value !== '—' && (
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-subtle)', marginLeft: '0.22rem' }}>/100</span>
              )}
            </div>
            <div style={{ marginTop: '0.25rem', color: 'var(--ink-subtle)', fontSize: '0.78rem', lineHeight: 1.35 }}>
              {card.detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}