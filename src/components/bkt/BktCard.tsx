// BKT AI-Apply — Card + StatCard (ported from the BKT design system)
import { useRef } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export interface BktCardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: number | string
  radius?: 'md' | 'lg' | 'xl' | '2xl'
  hoverable?: boolean
  header?: ReactNode
  footer?: ReactNode
}

const RADII = {
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
} as const

export function BktCard({
  children,
  padding = 20,
  radius = 'lg',
  hoverable = false,
  header = null,
  footer = null,
  style = {},
  ...rest
}: BktCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onEnter = () => {
    if (hoverable && ref.current) {
      ref.current.style.boxShadow = 'var(--shadow-md)'
      ref.current.style.transform = 'translateY(-1px)'
    }
  }
  const onLeave = () => {
    if (hoverable && ref.current) {
      ref.current.style.boxShadow = 'var(--shadow-sm)'
      ref.current.style.transform = 'translateY(0)'
    }
  }

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: RADII[radius],
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {header && (
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--text-strong)',
            fontSize: 'var(--text-md)',
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bkt-slate-50)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

/* ---- StatCard — dashboard stat with optional live pulse / action slot ---- */

export interface BktStatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  value?: ReactNode
  live?: boolean
  liveText?: ReactNode
  action?: ReactNode
  hint?: ReactNode
}

export function BktStatCard({
  label,
  value = null,
  live = false,
  liveText = null,
  action = null,
  hint = null,
  style = {},
  ...rest
}: BktStatCardProps) {
  const wrap: CSSProperties = {
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-sm)',
    padding: '18px 22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minWidth: 220,
    ...style,
  }
  return (
    <div style={wrap} {...rest}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            color: 'var(--text-strong)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {live && <LiveDot />}
          <span>{label}</span>
        </div>
        {value != null && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-tighter)',
              lineHeight: 1.05,
              color: 'var(--text-strong)',
            }}
          >
            {value}
          </div>
        )}
        {(liveText || hint) && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{liveText || hint}</div>}
      </div>
      {action && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>{action}</div>}
    </div>
  )
}

function LiveDot() {
  return (
    <span style={{ position: 'relative', width: 9, height: 9, display: 'inline-block', flexShrink: 0 }} aria-hidden>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--bkt-success)' }} />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'var(--bkt-success)',
          animation: 'bkt-ping 1.6s var(--ease-out) infinite',
        }}
      />
    </span>
  )
}
