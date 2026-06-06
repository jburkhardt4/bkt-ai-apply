import { useEffect, useState } from 'react'
import { DollarSign } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { getAiCostStatus, type AiCostStatus } from '../services/aiCostMonitorService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AiCostMonitorCardProps {
  refreshKey?: number
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

type BannerState = AiCostStatus['bannerState']

function badgeVariant(state: BannerState): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'blocked') return 'destructive'
  return 'outline'
}

function badgeLabel(state: BannerState): string {
  if (state === 'blocked') return 'Cap reached'
  if (state === 'alert') return '90% warning'
  if (state === 'warning') return '80% warning'
  return 'Budget OK'
}

function bannerClass(state: BannerState): string {
  if (state === 'blocked') return 'bg-red-50 border-red-200 text-red-800'
  if (state === 'alert') return 'bg-orange-50 border-orange-200 text-orange-800'
  if (state === 'warning') return 'bg-yellow-50 border-yellow-200 text-yellow-800'
  return 'bg-green-50 border-green-200 text-green-800'
}

export function AiCostMonitorCard({ refreshKey = 0 }: AiCostMonitorCardProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [status, setStatus] = useState<AiCostStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void getAiCostStatus(userId)
      .then((data) => { if (!cancelled) { setStatus(data); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load AI spend'); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, refreshKey])

  const summary = status?.summary ?? null
  const spendUsd = summary?.monthlySpendUsd ?? 0
  const capUsd = summary?.capUsd ?? 0
  const usagePercent = summary?.usagePercentOfCap ?? 0
  const remainingBufferUsd = summary ? Math.max(capUsd - spendUsd, 0) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                AI Cost Monitor
              </CardTitle>
              <CardDescription className="text-xs">
                Monthly usage against cap.
              </CardDescription>
            </div>
          </div>
          {status && (
            <Badge variant={badgeVariant(status.bannerState)} className="shrink-0 text-xs">
              {badgeLabel(status.bannerState)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && status === null ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {status && summary && (
              <>
                {/* Spend progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Monthly spend</span>
                    <span className="font-semibold text-foreground">{formatUsd(spendUsd)} / {formatUsd(capUsd)}</span>
                  </div>
                  <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground">{usagePercent.toFixed(1)}% of cap used · {formatUsd(remainingBufferUsd)} remaining</p>
                </div>

                {/* Banner message */}
                <div className={`rounded-md border px-3 py-2 text-sm ${bannerClass(status.bannerState)}`}>
                  <p className="font-semibold">{status.bannerTitle}</p>
                  <p className="mt-0.5 text-xs">{status.bannerBody}</p>
                </div>

                {/* Top breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Top provider', item: summary.spendByProvider[0] },
                    { label: 'Top model', item: summary.spendByModel[0] },
                    { label: 'Top task', item: summary.spendByTaskType[0] },
                  ].map(({ label, item }) => (
                    <div key={label} className="rounded-md border bg-muted/40 p-2">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{item?.key ?? 'No usage'}</p>
                      {item && <p className="text-[0.65rem] text-muted-foreground">{formatUsd(item.spendUsd)}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
