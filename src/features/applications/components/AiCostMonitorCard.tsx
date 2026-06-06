import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import { getAiCostStatus, type AiCostStatus } from '../services/aiCostMonitorService'

interface AiCostMonitorCardProps {
  refreshKey?: number
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function getToneStyles(state: AiCostStatus['bannerState']): { background: string; border: string; foreground: string } {
  if (state === 'blocked') {
    return { background: '#fff1f2', border: '#fecdd3', foreground: '#9f1239' }
  }

  if (state === 'alert') {
    return { background: '#fff7ed', border: '#fed7aa', foreground: '#9a3412' }
  }

  if (state === 'warning') {
    return { background: '#fffbeb', border: '#fde68a', foreground: '#92400e' }
  }

  return { background: '#ecfdf3', border: '#bbf7d0', foreground: '#166534' }
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
      .then((data) => {
        if (!cancelled) {
          setStatus(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load AI spend summary')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  if (loading && status === null) {
    return <div style={{ marginTop: '1rem', color: 'var(--ink-subtle)', fontSize: '0.875rem' }}>Loading AI spend…</div>
  }

  const summary = status?.summary ?? null
  const toneStyles = status ? getToneStyles(status.bannerState) : getToneStyles('ok')
  const spendUsd = summary?.monthlySpendUsd ?? 0
  const capUsd = summary?.capUsd ?? 0
  const remainingBufferUsd = summary ? Math.max(summary.capUsd - summary.monthlySpendUsd, 0) : 0
  const topProvider = summary?.spendByProvider[0]
  const topModel = summary?.spendByModel[0]
  const topTaskType = summary?.spendByTaskType[0]

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
            AI Cost Monitor
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-subtle)', fontSize: '0.82rem' }}>
            Monthly usage stays visible without blocking the workflow.
          </p>
        </div>
        {status && (
          <span
            style={{
              borderRadius: '999px',
              padding: '0.24rem 0.55rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              background: toneStyles.background,
              border: `1px solid ${toneStyles.border}`,
              color: toneStyles.foreground,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {status.bannerState === 'ok' && 'Budget OK'}
            {status.bannerState === 'warning' && '80% warning'}
            {status.bannerState === 'alert' && '90% warning'}
            {status.bannerState === 'blocked' && 'Cap reached'}
          </span>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginTop: '0.85rem', fontSize: '0.82rem' }}>{error}</div>}

      {status && summary && (
        <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.75rem' }}>
          <div
            style={{
              borderRadius: '16px',
              padding: '0.9rem',
              background: toneStyles.background,
              border: `1px solid ${toneStyles.border}`,
            }}
          >
            <div style={{ fontSize: '0.82rem', color: toneStyles.foreground, fontWeight: 700 }}>{status.bannerTitle}</div>
            <div style={{ marginTop: '0.25rem', color: toneStyles.foreground, fontSize: '0.84rem', lineHeight: 1.45 }}>
              {status.bannerBody}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.65rem',
            }}
          >
            {[
              { label: 'Current month spend', value: formatUsd(spendUsd) },
              { label: 'Cap', value: formatUsd(capUsd) },
              {
                label: 'Remaining buffer',
                value: formatUsd(remainingBufferUsd),
                detail: spendUsd > capUsd ? `Over by ${formatUsd(spendUsd - capUsd)}` : 'Available before cap triggers',
              },
              { label: 'Usage', value: `${summary.usagePercentOfCap.toFixed(1)}%` },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.92)',
                  padding: '0.8rem',
                }}
              >
                <div style={{ fontSize: '0.74rem', color: 'var(--ink-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '0.25rem', fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--ink-strong)' }}>
                  {item.value}
                </div>
                {'detail' in item && item.detail && (
                  <div style={{ marginTop: '0.2rem', color: 'var(--ink-subtle)', fontSize: '0.76rem', lineHeight: 1.35 }}>
                    {item.detail}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.65rem',
            }}
          >
            {[
              { label: 'Top provider', item: topProvider },
              { label: 'Top model', item: topModel },
              { label: 'Top task', item: topTaskType },
            ].map(({ label, item }) => (
              <div key={label} style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '0.75rem', background: '#fff' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--ink-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ marginTop: '0.25rem', color: 'var(--ink-strong)', fontWeight: 600, fontSize: '0.88rem' }}>
                  {item ? item.key : 'No usage yet'}
                </div>
                {item && (
                  <div style={{ marginTop: '0.18rem', color: 'var(--ink-subtle)', fontSize: '0.76rem' }}>
                    {formatUsd(item.spendUsd)} · {item.shareOfMonthlySpend.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ color: 'var(--ink-subtle)', fontSize: '0.76rem' }}>
            Warning thresholds: 80% at {formatUsd(summary.warning80Usd)}, 90% at {formatUsd(summary.warning90Usd)}, hard cap at {formatUsd(summary.capUsd)}.
          </div>
        </div>
      )}
    </section>
  )
}