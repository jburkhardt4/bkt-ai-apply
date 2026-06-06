import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import { getAnalyticsReport, type AnalyticsReport } from '../services/analyticsReportService'

interface AnalyticsReportsSectionProps {
  refreshKey?: number
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

export function AnalyticsReportsSection({ refreshKey = 0 }: AnalyticsReportsSectionProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    void getAnalyticsReport(userId)
      .then((data) => {
        if (!cancelled) {
          setReport(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics reports')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  if (loading && report === null) {
    return <div style={{ marginTop: '1rem', color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>Loading analytics reports…</div>
  }

  const topSources = (report?.conversionBySource ?? []).slice(0, 4)
  const topIndustries = (report?.interviewRateByIndustry ?? []).slice(0, 4)
  const outcomeDistribution = report?.scoreOutcomeDistribution ?? []
  const trendPoints = (report?.scoreOutcomeTrend ?? []).slice(-4)

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
            Analytics Reports
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-subtle)', fontSize: '0.82rem' }}>
            Conversion by board, interview rate by industry, and score-to-outcome trends.
          </p>
        </div>
        {report && (
          <span style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem' }}>
            Updated {new Date(report.generatedAtIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginTop: '0.85rem', fontSize: '0.82rem' }}>{error}</div>}

      <div
        style={{
          marginTop: '0.85rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.7rem',
        }}
      >
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: '#fff', padding: '0.72rem' }}>
          <h3 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: '0.85rem' }}>Conversion by source</h3>
          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.55rem' }}>
            {topSources.length === 0 ? (
              <div style={{ color: 'var(--ink-subtle)', fontSize: '0.78rem' }}>No source activity yet.</div>
            ) : (
              topSources.map((row) => (
                <div key={row.source} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem' }}>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.79rem' }}>{row.source}</span>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 700, fontSize: '0.78rem' }}>{formatPercent(row.conversionRate)}</span>
                  </div>
                  <div style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem', marginTop: '0.18rem' }}>
                    {row.convertedApplications}/{row.totalApplications} converted
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: '#fff', padding: '0.72rem' }}>
          <h3 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: '0.85rem' }}>Interview rate by industry</h3>
          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.55rem' }}>
            {topIndustries.length === 0 ? (
              <div style={{ color: 'var(--ink-subtle)', fontSize: '0.78rem' }}>No interview activity yet.</div>
            ) : (
              topIndustries.map((row) => (
                <div key={row.industry} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem' }}>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.79rem' }}>{row.industry}</span>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 700, fontSize: '0.78rem' }}>{formatPercent(row.interviewRate)}</span>
                  </div>
                  <div style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem', marginTop: '0.18rem' }}>
                    {row.interviewReachedApplications}/{row.totalApplications} reached interview stages
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.7rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.7rem',
        }}
      >
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: '#fff', padding: '0.72rem' }}>
          <h3 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: '0.85rem' }}>Score vs outcome distribution</h3>
          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.55rem' }}>
            {outcomeDistribution.length === 0 ? (
              <div style={{ color: 'var(--ink-subtle)', fontSize: '0.78rem' }}>No score/outcome data yet.</div>
            ) : (
              outcomeDistribution.map((row) => (
                <div key={row.outcome} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem' }}>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.79rem', textTransform: 'capitalize' }}>
                      {row.outcome.replace('_', ' ')}
                    </span>
                    <span style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem' }}>{row.applicationCount} apps</span>
                  </div>
                  <div style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem', marginTop: '0.18rem' }}>
                    Avg score: {formatScore(row.averageScore)} · 80+ share: {formatPercent(row.highScoreShare)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', background: '#fff', padding: '0.72rem' }}>
          <h3 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: '0.85rem' }}>Score/outcome trend</h3>
          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.55rem' }}>
            {trendPoints.length === 0 ? (
              <div style={{ color: 'var(--ink-subtle)', fontSize: '0.78rem' }}>No trend points yet.</div>
            ) : (
              trendPoints.map((row) => (
                <div key={row.month} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.55rem' }}>
                    <span style={{ color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.79rem' }}>{row.month}</span>
                    <span style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem' }}>{row.applicationCount} apps</span>
                  </div>
                  <div style={{ color: 'var(--ink-subtle)', fontSize: '0.75rem', marginTop: '0.18rem' }}>
                    Avg score: {formatScore(row.averageScore)} · Success: {formatPercent(row.successRate)} · Rejected: {formatPercent(row.rejectionRate)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
