// BKT AI-Apply — Badge (ported from the BKT design system)
// Pill labels for statuses, match tiers, counts and tags.
import type { CSSProperties, HTMLAttributes } from 'react'

export type BktBadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'silver'
export type BktBadgeAppearance = 'solid' | 'soft' | 'outline'

export interface BktBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BktBadgeTone
  appearance?: BktBadgeAppearance
  dot?: boolean
  pulse?: boolean
}

const PALETTE: Record<BktBadgeTone, { solid: [string, string]; soft: [string, string]; line: string }> = {
  brand: { solid: ['var(--primary)', '#fff'], soft: ['var(--bkt-blue-50)', 'var(--bkt-blue-700)'], line: 'var(--bkt-blue-300)' },
  neutral: { solid: ['var(--bkt-slate-700)', '#fff'], soft: ['var(--bkt-slate-100)', 'var(--bkt-slate-600)'], line: 'var(--bkt-slate-300)' },
  success: { solid: ['var(--bkt-success)', '#fff'], soft: ['var(--bkt-success-soft)', 'var(--bkt-success-ink)'], line: '#9ad8b0' },
  warning: { solid: ['var(--bkt-warning)', '#fff'], soft: ['var(--bkt-warning-soft)', 'var(--bkt-warning-ink)'], line: '#e9c28a' },
  danger: { solid: ['var(--bkt-danger)', '#fff'], soft: ['var(--bkt-danger-soft)', 'var(--bkt-danger-ink)'], line: '#eaa6a8' },
  info: { solid: ['var(--bkt-info)', '#fff'], soft: ['var(--bkt-info-soft)', 'var(--bkt-info)'], line: '#a9c5fb' },
  silver: { solid: ['var(--bkt-silver-400)', '#fff'], soft: ['var(--bkt-silver-100)', 'var(--bkt-silver-500)'], line: 'var(--bkt-silver-300)' },
}

export function BktBadge({
  children,
  tone = 'neutral',
  appearance = 'soft',
  dot = false,
  pulse = false,
  style = {},
  ...rest
}: BktBadgeProps) {
  const p = PALETTE[tone]
  const look: CSSProperties =
    appearance === 'solid'
      ? { background: p.solid[0], color: p.solid[1], border: '1px solid transparent' }
      : appearance === 'outline'
        ? { background: 'transparent', color: p.soft[1], border: `1px solid ${p.line}` }
        : { background: p.soft[0], color: p.soft[1], border: '1px solid transparent' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 10px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 700,
        letterSpacing: '0.01em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...look,
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: appearance === 'solid' ? 'currentColor' : p.solid[0],
            }}
          />
          {pulse && (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: p.solid[0],
                animation: 'bkt-ping 1.4s var(--ease-out) infinite',
              }}
            />
          )}
        </span>
      )}
      {children}
    </span>
  )
}
