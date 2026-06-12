// BKT AI-Apply — Quick Review: tinder-style review card.
// Ported 1:1 from the design-system UI kit (QuickReview.jsx).
// Drag to swipe (release past ±120px), ← → ↓ keys, or the action bar.
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktAvatar } from '@/components/bkt/BktAvatar'
import { BktButton } from '@/components/bkt/BktButton'
import { BktCard } from '@/components/bkt/BktCard'
import { ChipPill, QualLine } from '@/components/bkt/bits'
import { companyLogo } from '@/components/bkt/format'
import type { JobMatch } from '../types'

function QRMatchBanner({ score }: { score: number }) {
  const tier =
    score >= 80
      ? ['var(--bkt-success-soft)', 'var(--bkt-success-ink)', 'Perfect fit']
      : score >= 65
        ? ['var(--bkt-blue-50)', 'var(--bkt-blue-700)', 'Strong fit']
        : ['var(--bkt-warning-soft)', 'var(--bkt-warning-ink)', 'Possible fit']
  return (
    <span
      className="bkt-num"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: tier[0],
        color: tier[1],
        borderRadius: 'var(--radius-pill)',
        padding: '7px 13px',
        font: '600 var(--text-sm)/1 var(--font-body)',
      }}
    >
      <Icon name="badge-check" size={15} strokeWidth={2} />
      <span>{score}/100</span>
      <span style={{ opacity: 0.45 }}>|</span>
      <span style={{ fontWeight: 500 }}>{tier[2]}</span>
    </span>
  )
}

type Intent = 'apply' | 'decline' | null
type Leaving = 'left' | 'right' | 'skip' | null

export interface QuickReviewProps {
  jobs: JobMatch[]
  onApply: (id: JobMatch['id']) => void
  onDecline: (id: JobMatch['id']) => void
}

export function QuickReview({ jobs, onApply, onDecline }: QuickReviewProps) {
  const queue = jobs.filter((j) => j.status === 'Review')
  const [idx, setIdx] = useState(0)
  const [intent, setIntent] = useState<Intent>(null)
  const [leaving, setLeaving] = useState<Leaving>(null)
  const [drag, setDrag] = useState<{ dx: number } | null>(null)
  const job = queue[Math.min(idx, queue.length - 1)]
  const next = queue[Math.min(idx, queue.length - 1) + 1]

  const advance = (action: 'apply' | 'decline' | 'skip') => {
    if (!job || leaving) return
    setLeaving(action === 'decline' ? 'left' : action === 'apply' ? 'right' : 'skip')
    setTimeout(() => {
      if (action === 'apply') onApply(job.id)
      if (action === 'decline') onDecline(job.id)
      if (action === 'skip') setIdx((i) => i + 1)
      setLeaving(null)
      setIntent(null)
      setDrag(null)
    }, 260)
  }

  // Keyboard: ← decline, → apply, ↓ skip. Re-subscribes each render so the
  // handler closes over the current card (mirrors the kit implementation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') advance('decline')
      if (e.key === 'ArrowRight') advance('apply')
      if (e.key === 'ArrowDown') advance('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Pointer drag-to-swipe
  const start = useRef<number | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    start.current = e.clientX
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current == null || leaving) return
    const dx = e.clientX - start.current
    setDrag({ dx })
    setIntent(dx < -40 ? 'decline' : dx > 40 ? 'apply' : null)
  }
  const endDrag = () => {
    if (start.current == null) return
    const dx = drag ? drag.dx : 0
    start.current = null
    if (dx < -120) advance('decline')
    else if (dx > 120) advance('apply')
    else {
      setDrag(null)
      setIntent(null)
    }
  }

  const wash =
    intent === 'decline'
      ? 'linear-gradient(135deg, #fdecec 0%, #fbf2ef 55%, var(--bkt-zinc-50) 100%)'
      : intent === 'apply'
        ? 'linear-gradient(135deg, #e2f5e9 0%, #eef8f1 55%, var(--bkt-zinc-50) 100%)'
        : 'linear-gradient(135deg, var(--bkt-blue-50) 0%, #f1f3f9 55%, var(--bkt-zinc-50) 100%)'

  if (!job) {
    return (
      <div
        className="bkt-enter"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}
      >
        <Icon name="check-check" size={28} color="var(--bkt-success)" />
        <span style={{ font: '600 var(--text-lg)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>All caught up</span>
        <span style={{ font: '400 var(--text-base)/1.4 var(--font-body)' }}>No matches left to review.</span>
      </div>
    )
  }

  const dx = drag ? drag.dx : 0
  const cardTransform =
    leaving === 'left'
      ? 'translateX(-480px) rotate(-7deg)'
      : leaving === 'right'
        ? 'translateX(480px) rotate(7deg)'
        : leaving === 'skip'
          ? 'translateY(28px) scale(0.97)'
          : drag
            ? `translateX(${dx}px) rotate(${dx / 40}deg)`
            : 'none'

  return (
    <div
      className="bkt-scroll"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: wash,
        transition: 'background var(--dur-medium) var(--ease-standard)',
        padding: '30px 40px 24px',
        gap: 22,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: 'min(900px, 100%)' }}>
        {next && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -10,
              left: 22,
              right: 22,
              height: 60,
              background: 'var(--surface)',
              borderRadius: 'var(--radius-2xl)',
              boxShadow: 'var(--shadow-sm)',
              opacity: 0.75,
              transform: drag || leaving ? 'translateY(-2px) scale(1.0)' : 'none',
              transition: 'transform var(--dur-medium) var(--ease-out)',
            }}
          ></div>
        )}
        <BktCard
          radius="2xl"
          padding={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          style={{
            position: 'relative',
            boxShadow: 'var(--shadow-xl)',
            cursor: drag ? 'grabbing' : 'grab',
            transform: cardTransform,
            opacity: leaving && leaving !== 'skip' ? 0 : 1,
            transition: drag ? 'none' : 'transform var(--dur-medium) var(--ease-standard), opacity var(--dur-medium) var(--ease-standard)',
            userSelect: 'none',
            touchAction: 'pan-y',
            willChange: 'transform',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-2xl)',
              pointerEvents: 'none',
              zIndex: 5,
              boxShadow:
                intent === 'decline' ? 'inset 0 0 0 2px var(--bkt-danger)' : intent === 'apply' ? 'inset 0 0 0 2px var(--bkt-success)' : 'none',
              transition: 'box-shadow var(--dur-base) var(--ease-standard)',
            }}
          ></div>

          <div key={String(job.id)} className="bkt-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, padding: 24 }}>
            {/* LEFT — identity, chips, summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    background: 'var(--bkt-zinc-100)',
                    borderRadius: 12,
                    boxShadow: '0 0 0 1px rgba(16,16,19,0.07)',
                  }}
                >
                  <BktAvatar name={job.company} src={companyLogo(job.domain)} size={40} square />
                </span>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: '600 var(--text-lg)/1.3 var(--font-display)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text-strong)' }}>
                    {job.title}
                  </span>
                  <span style={{ font: '500 var(--text-sm)/1.3 var(--font-body)', color: 'var(--bkt-zinc-600)' }}>{job.company}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {job.level && (
                  <ChipPill icon="chart-bar" style={{ height: 32 }}>
                    {job.level}
                  </ChipPill>
                )}
                <ChipPill icon="external-link" onClick={() => {}} style={{ height: 32, background: 'var(--surface)' }}>
                  View Job
                </ChipPill>
                <QRMatchBanner score={job.score} />
                {job.location && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--bkt-zinc-100)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '5px 11px',
                      font: '500 var(--text-xs)/1 var(--font-body)',
                      color: 'var(--text-body)',
                    }}
                  >
                    <Icon name="map-pin" size={13} style={{ opacity: 0.5 }} />
                    {job.location}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 8 }}>
                <span style={{ font: '600 var(--text-base)/1 var(--font-body)', color: 'var(--text-strong)' }}>Summary</span>
                <ul style={{ margin: 0, paddingLeft: 18, font: '400 var(--text-base)/1.6 var(--font-body)', color: 'var(--text-body)' }}>
                  <li>{job.overview}</li>
                </ul>
              </div>
            </div>

            {/* RIGHT — gray qualification panel */}
            <div style={{ background: 'var(--bkt-zinc-100)', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 18px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="sparkles" size={16} color="var(--primary)" />
                  <span style={{ font: '700 var(--text-base)/1 var(--font-body)', color: 'var(--text-strong)' }}>Why this might be a good fit</span>
                </div>
                <p style={{ margin: '8px 0 0', font: '400 var(--text-sm)/1.6 var(--font-body)', color: 'var(--text-body)' }}>{job.why}</p>
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                <p style={{ margin: 0, font: '600 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)' }}>Qualifications</p>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <p style={{ margin: '0 0 6px', font: '600 var(--text-sm)/1 var(--font-body)', color: 'var(--bkt-zinc-700)' }}>Key Matches</p>
                    {(job.keyMatches ?? []).map((m) => (
                      <QualLine key={m} ok>
                        {m}
                      </QualLine>
                    ))}
                  </div>
                  <div>
                    <p style={{ margin: '0 0 6px', font: '600 var(--text-sm)/1 var(--font-body)', color: 'var(--bkt-zinc-700)' }}>Key Gaps</p>
                    {(job.keyGaps ?? []).map((g) => (
                      <QualLine key={g} ok={false}>
                        {g}
                      </QualLine>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* About card */}
          <div
            style={{
              margin: '0 24px 24px',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 0 0 1px rgba(16,16,19,0.06)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <span style={{ font: '600 var(--text-base)/1 var(--font-body)', color: 'var(--text-strong)' }}>About {job.company}</span>
            <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}>{job.about}</span>
          </div>
        </BktCard>
      </div>

      {/* action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BktButton
          variant="danger"
          size="lg"
          style={{ borderRadius: 'var(--radius-pill)', minWidth: 160 }}
          iconLeft={<Icon name="circle-arrow-left" size={17} />}
          onMouseEnter={() => !drag && setIntent('decline')}
          onMouseLeave={() => !drag && setIntent(null)}
          onClick={() => advance('decline')}
        >
          Decline
        </BktButton>
        <BktButton
          variant="outline"
          size="lg"
          style={{ borderRadius: 'var(--radius-pill)', minWidth: 140, background: 'var(--surface)' }}
          onClick={() => advance('skip')}
        >
          Skip
        </BktButton>
        <BktButton
          variant="success"
          size="lg"
          style={{ borderRadius: 'var(--radius-pill)', minWidth: 160 }}
          iconRight={<Icon name="circle-arrow-right" size={17} />}
          onMouseEnter={() => !drag && setIntent('apply')}
          onMouseLeave={() => !drag && setIntent(null)}
          onClick={() => advance('apply')}
        >
          Apply
        </BktButton>
      </div>
      <span style={{ font: '500 var(--text-xs)/1 var(--font-body)', color: 'var(--text-subtle)' }}>
        Drag the card, use ← → ↓, or click — {queue.length} left to review
      </span>
    </div>
  )
}
