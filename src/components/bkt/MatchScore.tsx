// BKT AI-Apply — MatchScore (ported from the BKT design system)
// Fit-score chip with tiered color: 80+ green, 65–79 royal blue, below amber.
import type { HTMLAttributes, ReactNode } from 'react'

export interface MatchScoreProps extends HTMLAttributes<HTMLSpanElement> {
  score: number
  variant?: 'chip' | 'banner'
  label?: ReactNode
  showInfo?: boolean
}

export function MatchScore({ score, variant = 'chip', label = null, showInfo = true, style = {}, ...rest }: MatchScoreProps) {
  const tier =
    score >= 80
      ? { color: 'var(--bkt-score-high)', soft: 'var(--bkt-success-soft)', word: 'Perfect fit' }
      : score >= 65
        ? { color: 'var(--bkt-score-good)', soft: 'var(--bkt-blue-50)', word: 'Strong fit' }
        : { color: 'var(--bkt-score-mid)', soft: 'var(--bkt-warning-soft)', word: 'Possible fit' }

  if (variant === 'banner') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: tier.soft,
          color: tier.color,
          border: `1px solid color-mix(in oklab, var(--border) 30%, ${tier.color} 25%)`,
          borderRadius: 'var(--radius-pill)',
          padding: '8px 16px',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: 'var(--text-md)',
          ...style,
        }}
        {...rest}
      >
        <CheckIcon color={tier.color} />
        <span>{score}/100</span>
        <span style={{ width: 1, alignSelf: 'stretch', background: 'currentColor', opacity: 0.25 }} />
        <span>{label || tier.word}</span>
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        color: tier.color,
        background: tier.soft,
        borderRadius: 'var(--radius-pill)',
        padding: '2px 9px',
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: 'var(--text-sm)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      <ArrowIcon color={tier.color} up={score >= 65} />
      <span>{score}</span>
      {showInfo && <InfoIcon color={tier.color} />}
    </span>
  )
}

function ArrowIcon({ color, up }: { color: string; up: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d={up ? 'M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8' : 'M2.5 6h7M9.5 6L6.5 3M9.5 6L6.5 9'}
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function InfoIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ opacity: 0.7 }}>
      <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.2" />
      <path d="M6 5.4v3" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="3.4" r="0.7" fill={color} />
    </svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.6" stroke={color} strokeWidth="1.5" />
      <path d="M5.2 8.2l1.9 1.9 3.7-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
