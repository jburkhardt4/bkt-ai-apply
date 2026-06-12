// BKT AI-Apply — Checkbox + Skeleton (ported from the BKT design system)
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/* ---- Checkbox — brand-navy checked fill with a spring pop ---- */

export interface BktCheckboxProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (next: boolean) => void
  label?: ReactNode
  disabled?: boolean
  size?: number
  style?: CSSProperties
}

export function BktCheckbox({ checked, defaultChecked = false, onChange, label = null, disabled = false, size = 18, style = {} }: BktCheckboxProps) {
  const isControlled = checked !== undefined
  const [internal, setInternal] = useState(defaultChecked)
  const on = isControlled ? checked : internal

  const toggle = () => {
    if (disabled) return
    if (!isControlled) setInternal(!on)
    onChange?.(!on)
  }

  return (
    <label
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}
    >
      <span
        onClick={toggle}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border-strong)'}`,
          background: on ? 'var(--primary)' : 'var(--surface)',
          boxShadow: on ? 'var(--shadow-brand)' : 'var(--shadow-xs)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition:
            'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), transform var(--dur-base) var(--ease-spring)',
        }}
      >
        <svg
          width={size * 0.66}
          height={size * 0.66}
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: on ? 'scale(1)' : 'scale(0)', transition: 'transform var(--dur-base) var(--ease-spring)' }}
        >
          <path d="M5 12.5l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span style={{ font: '400 var(--text-base)/1.3 var(--font-body)', color: 'var(--text-body)' }}>{label}</span>}
    </label>
  )
}

/* ---- Skeleton — shimmer loading placeholder ---- */

export interface BktSkeletonProps {
  shape?: 'rect' | 'circle' | 'pill' | 'text' | 'avatar'
  width?: number | string
  height?: number | string
  lines?: number
  style?: CSSProperties
}

const SHIMMER: CSSProperties = {
  background: 'linear-gradient(90deg, var(--bkt-zinc-200) 25%, var(--bkt-zinc-100) 50%, var(--bkt-zinc-200) 75%)',
  backgroundSize: '200% 100%',
  animation: 'bkt-shimmer 1.4s ease-in-out infinite',
}

const SKELETON_RADII = { rect: 'var(--radius-md)', circle: '50%', pill: 'var(--radius-pill)', avatar: '50%' } as const
const SKELETON_DEFAULTS = {
  rect: { w: 200, h: 20 },
  circle: { w: 40, h: 40 },
  pill: { w: 80, h: 26 },
  avatar: { w: 40, h: 40 },
} as const

export function BktSkeleton({ shape = 'rect', width, height, lines = 1, style = {} }: BktSkeletonProps) {
  if (shape === 'text') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: width || '100%', ...style }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              height: height || 14,
              borderRadius: 6,
              width: i === lines - 1 && lines > 1 ? '65%' : '100%',
              ...SHIMMER,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        width: width || SKELETON_DEFAULTS[shape].w,
        height: height || SKELETON_DEFAULTS[shape].h,
        borderRadius: SKELETON_RADII[shape],
        flexShrink: 0,
        ...SHIMMER,
        ...style,
      }}
    />
  )
}
