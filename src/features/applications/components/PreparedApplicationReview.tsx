// BKT AI-Apply — PreparedApplicationReview (ADR-013, read-only review surface).
//
// A minimal, self-contained container that loads ONE prepared application + its
// mapped fields and lists them, visually flagging review-gated fields as "needs
// your review" and surfacing the record status + gating_reason. It is read-only:
// it never writes, never auto-fills, and never reveals a sensitive value (the
// human supplies/confirms those in their own browser session). Styling follows
// the BKT design-system inline-style convention (var(--…) tokens), per
// docs/conventions/component-patterns.md → "BKT design-system surface". The file
// exports ONLY this component; helpers live in the sibling .helpers.ts
// (react-refresh/only-export-components).

import { useEffect, useRef, useState } from 'react'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktCard } from '@/components/bkt/BktCard'
import { BktSkeleton } from '@/components/bkt/BktCheckbox'
import { Icon } from '@/components/bkt/Icon'
import { useAuth } from '@/contexts/auth-context'
import {
  fetchPreparedApplicationWithFields,
  type PreparedApplicationWithFields,
} from '@/features/applications/services/preparedApplicationService'
import { statusNeedsAttention } from '@/features/applications/services/preparedApplicationGating'
import {
  humanizeToken,
  statusTone,
  toReviewFieldVM,
  type ReviewFieldVM,
} from './preparedApplicationReview.helpers'

export interface PreparedApplicationReviewProps {
  /** The prepared_applications.id to load and review. */
  preparedApplicationId: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready'; data: PreparedApplicationWithFields }

export function PreparedApplicationReview({ preparedApplicationId }: PreparedApplicationReviewProps) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const targetKey = `${userId ?? ''}::${preparedApplicationId}`
  // No session → empty; a session → loading. Seeded in useState so we never set
  // state synchronously in the effect body (react-hooks/set-state-in-effect).
  const [state, setState] = useState<LoadState>(() => (userId ? { kind: 'loading' } : { kind: 'empty' }))
  const alive = useRef(true)
  // Store-previous-prop in STATE (not a ref — refs may not be read/written
  // during render per react-hooks/refs) and reset during render when the target
  // identity changes. React supports this "adjust state during render" form; the
  // setPrevKey guard makes it run at most once per change (no loop). Mirrors
  // component-patterns.md → "Resetting state without effects".
  const [prevKey, setPrevKey] = useState(targetKey)
  if (prevKey !== targetKey) {
    setPrevKey(targetKey)
    const next: LoadState = userId ? { kind: 'loading' } : { kind: 'empty' }
    if (state.kind !== next.kind) setState(next)
  }

  useEffect(() => {
    if (!userId) return
    alive.current = true
    // set-state-in-effect: setState runs only inside the promise callbacks.
    fetchPreparedApplicationWithFields(userId, preparedApplicationId).then(
      (data) => {
        if (!alive.current) return
        setState(data ? { kind: 'ready', data } : { kind: 'empty' })
      },
      (err: unknown) => {
        if (!alive.current) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load this prepared application.',
        })
      },
    )
    return () => {
      alive.current = false
    }
  }, [userId, preparedApplicationId])

  if (state.kind === 'loading') return <ReviewSkeleton />
  if (state.kind === 'error') return <ReviewMessage icon="triangle-alert" tone="danger" text={state.message} />
  if (state.kind === 'empty') {
    return (
      <ReviewMessage
        icon="file-search"
        tone="muted"
        text="No prepared application found. Prepare a job to see its mapped fields here."
      />
    )
  }

  const { app, fields } = state.data
  const reviewVMs = fields.map(toReviewFieldVM)
  const gatedCount = reviewVMs.filter((f) => f.reviewGate).length
  const needsAttention = statusNeedsAttention(app.status)

  return (
    <BktCard
      padding={0}
      radius="xl"
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <Icon name="clipboard-list" size={18} color="var(--text-muted)" />
          <span>Prepared application</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <BktBadge tone={statusTone(app.status)} appearance="soft">
              {humanizeToken(app.status)}
            </BktBadge>
            {gatedCount > 0 && (
              <BktBadge tone="warning" appearance="outline">
                {gatedCount} to review
              </BktBadge>
            )}
          </span>
        </div>
      }
    >
      {/* Meta row: ATS family · anti-bot tier · score · prepared-by */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <MetaChip icon="building-2" label={humanizeToken(app.ats_family)} />
        <MetaChip icon="shield" label={`${humanizeToken(app.antibot_tier)} anti-bot`} />
        {app.match_score != null && <MetaChip icon="target" label={`Match ${Math.round(app.match_score)}`} />}
        <MetaChip icon="bot" label={humanizeToken(app.mode)} />
        <MetaChip icon="wand-2" label={humanizeToken(app.prepared_by)} />
      </div>

      {/* Attention banner — status needs the human before the macro can fill */}
      {needsAttention && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 20px',
            background: 'var(--bkt-warning-soft)',
            color: 'var(--bkt-warning-ink)',
            borderBottom: '1px solid var(--border)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.4,
          }}
        >
          <Icon name="triangle-alert" size={16} color="var(--bkt-warning-ink)" />
          <span>
            <strong>{humanizeToken(app.status)}.</strong>{' '}
            {app.gating_reason ?? 'Review the flagged fields before this application can be filled.'}
          </span>
        </div>
      )}

      {/* Field list */}
      {reviewVMs.length === 0 ? (
        <div style={{ padding: '20px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          No fields were mapped for this application yet.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {reviewVMs.map((field, index) => (
            <FieldRow key={field.key} field={field} index={index} />
          ))}
        </ul>
      )}
    </BktCard>
  )
}

/* ───────────────────────────── sub-components ───────────────────────────── */

function FieldRow({ field, index }: { field: ReviewFieldVM; index: number }) {
  // Subtle staggered entrance (decorative, ≤ 80ms steps, capped). transform +
  // opacity only — GPU-friendly per the design-eng performance rules.
  const delay = Math.min(index, 8) * 40
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 20px',
        borderTop: index === 0 ? 'none' : '1px solid var(--border)',
        opacity: 0,
        transform: 'translateY(6px)',
        animation: `bkt-fade-up var(--dur-base, 240ms) var(--ease-out, ease-out) ${delay}ms forwards`,
      }}
    >
      <Icon
        name={field.reviewGate ? 'lock' : 'check'}
        size={16}
        color={field.reviewGate ? 'var(--bkt-warning)' : 'var(--bkt-success)'}
        style={{ marginTop: 2 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>
            {field.label}
          </span>
          {field.isSensitive && (
            <BktBadge tone="danger" appearance="soft">
              Sensitive
            </BktBadge>
          )}
          {field.reviewGate && (
            <BktBadge tone="warning" appearance="soft" dot>
              Needs your review
            </BktBadge>
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {/* Sensitive / gated values are NEVER shown — the human supplies them. */}
          {field.reviewGate ? (
            <span style={{ fontStyle: 'italic' }}>Supply this yourself when you review the form.</span>
          ) : field.displayValue != null ? (
            <span style={{ color: 'var(--text-body)' }}>{field.displayValue}</span>
          ) : (
            <span style={{ fontStyle: 'italic' }}>Not mapped</span>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <BktBadge tone="neutral" appearance="outline">
          {humanizeToken(field.source)}
        </BktBadge>
        {field.confidencePct != null && !field.reviewGate && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {field.confidencePct}% conf.
          </span>
        )}
      </div>
    </li>
  )
}

function MetaChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--bkt-slate-50)',
        border: '1px solid var(--border)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 600,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={13} color="var(--text-muted)" />
      {label}
    </span>
  )
}

function ReviewSkeleton() {
  return (
    <BktCard padding={20} radius="xl" aria-busy="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BktSkeleton shape="text" lines={1} width="42%" height={18} />
        <BktSkeleton shape="text" lines={4} />
      </div>
    </BktCard>
  )
}

function ReviewMessage({
  icon,
  tone,
  text,
}: {
  icon: string
  tone: 'danger' | 'muted'
  text: string
}) {
  const color = tone === 'danger' ? 'var(--bkt-danger)' : 'var(--text-muted)'
  return (
    <BktCard padding={24} radius="xl">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color, fontSize: 'var(--text-sm)' }}>
        <Icon name={icon} size={18} color={color} />
        <span>{text}</span>
      </div>
    </BktCard>
  )
}
