import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { getAnalyticsReport, type AnalyticsReport } from '../services/analyticsReportService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AnalyticsReportsSectionProps {
  refreshKey?: number
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-2 text-xs text-muted-foreground">{message}</p>
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
      .then((data) => { if (!cancelled) { setReport(data); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load analytics'); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const topSources = (report?.conversionBySource ?? []).slice(0, 4)
  const topIndustries = (report?.interviewRateByIndustry ?? []).slice(0, 4)
  const outcomeDistribution = report?.scoreOutcomeDistribution ?? []
  const trendPoints = (report?.scoreOutcomeTrend ?? []).slice(-4)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                Analytics Reports
              </CardTitle>
              <CardDescription className="text-xs">
                Conversion, interview rate, and score trends.
              </CardDescription>
            </div>
          </div>
          {report && (
            <span className="text-xs text-muted-foreground">
              {new Date(report.generatedAtIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && report === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="grid grid-cols-2 gap-3">
              {/* Conversion by source */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversion by source</h3>
                {topSources.length === 0 ? (
                  <EmptyState message="No source activity yet." />
                ) : (
                  topSources.map((row) => (
                    <div key={row.source} className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate">{row.source}</span>
                        <span className="ml-2 shrink-0 font-semibold text-foreground">{formatPercent(row.conversionRate)}</span>
                      </div>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{row.convertedApplications}/{row.totalApplications} converted</p>
                    </div>
                  ))
                )}
              </div>

              {/* Interview rate by industry */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interview rate by industry</h3>
                {topIndustries.length === 0 ? (
                  <EmptyState message="No interview activity yet." />
                ) : (
                  topIndustries.map((row) => (
                    <div key={row.industry} className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate">{row.industry}</span>
                        <span className="ml-2 shrink-0 font-semibold text-foreground">{formatPercent(row.interviewRate)}</span>
                      </div>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{row.interviewReachedApplications}/{row.totalApplications} reached interview</p>
                    </div>
                  ))
                )}
              </div>

              {/* Score vs outcome */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score vs outcome</h3>
                {outcomeDistribution.length === 0 ? (
                  <EmptyState message="No score/outcome data yet." />
                ) : (
                  outcomeDistribution.map((row) => (
                    <div key={row.outcome} className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground capitalize">{row.outcome.replace('_', ' ')}</span>
                        <span className="text-muted-foreground">{row.applicationCount} apps</span>
                      </div>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Avg {formatScore(row.averageScore)} · 80+ {formatPercent(row.highScoreShare)}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Trend */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score/outcome trend</h3>
                {trendPoints.length === 0 ? (
                  <EmptyState message="No trend points yet." />
                ) : (
                  trendPoints.map((row) => (
                    <div key={row.month} className="rounded-md border bg-muted/30 px-2.5 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{row.month}</span>
                        <span className="text-muted-foreground">{row.applicationCount} apps</span>
                      </div>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Avg {formatScore(row.averageScore)} · Success {formatPercent(row.successRate)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
