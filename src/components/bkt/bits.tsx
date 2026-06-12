// BKT AI-Apply — shared small pieces ported from the UI kit's helpers.jsx:
// ChipPill, QualLine, SkillTag (companyLogo / formatStamp live in format.ts).
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'

/** Small outline pill (Senior · View Job · Los Angeles chips). */
export function ChipPill({
  icon,
  children,
  onClick,
  style = {},
}: {
  icon?: string
  children: ReactNode
  onClick?: () => void
  style?: CSSProperties
}) {
  const [hover, setHover] = useState(false)
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 34,
        padding: '0 14px',
        background: hover && onClick ? 'var(--bkt-slate-100)' : 'var(--bkt-slate-50)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        font: '600 var(--text-sm)/1 var(--font-body)',
        color: 'var(--text-strong)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease-standard)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={14} color="var(--text-muted)" />}
      {children}
    </span>
  )
}

/** Check/X qualification line for Key Matches / Key Gaps. */
export function QualLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '3px 0',
        font: '400 var(--text-sm)/1.45 var(--font-body)',
        color: 'var(--text-body)',
      }}
    >
      <Icon
        name={ok ? 'circle-check' : 'circle-x'}
        size={15}
        strokeWidth={2}
        color={ok ? 'var(--bkt-success)' : 'var(--bkt-danger)'}
        style={{ marginTop: 2 }}
      />
      <span>{children}</span>
    </div>
  )
}

/** Soft skill tag. */
export function SkillTag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        padding: '0 11px',
        background: 'var(--bkt-slate-100)',
        borderRadius: 'var(--radius-md)',
        font: '500 var(--text-xs)/1 var(--font-body)',
        color: 'var(--text-body)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
