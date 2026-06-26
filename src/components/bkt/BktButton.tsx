// BKT AI-Apply — Button (ported from the BKT design system)
// Brand-navy primary with a tactile press (scale + shadow) interaction.
import { useRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export type BktButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
export type BktButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface BktButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BktButtonVariant
  size?: BktButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

const SIZES: Record<BktButtonSize, CSSProperties> = {
  sm: { height: 34, padding: '0 12px', fontSize: 'var(--text-sm)' },
  md: { height: 40, padding: '0 18px', fontSize: 'var(--text-base)' },
  lg: { height: 48, padding: '0 26px', fontSize: 'var(--text-md)' },
  icon: { height: 40, width: 40, padding: 0, fontSize: 'var(--text-base)' },
}

const VARIANTS: Record<BktButtonVariant, CSSProperties> = {
  primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: 'var(--shadow-brand)' },
  secondary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', borderColor: 'var(--border)' },
  outline: { background: 'var(--surface)', color: 'var(--text-strong)', borderColor: 'var(--border-strong)' },
  ghost: { background: 'transparent', color: 'var(--text-body)' },
  danger: { background: 'var(--bkt-danger)', color: '#fff', boxShadow: '0 8px 18px rgba(229,72,77,0.26)' },
  success: { background: 'var(--bkt-success)', color: '#fff', boxShadow: '0 8px 18px rgba(22,163,74,0.24)' },
}

const HOVER_BG: Record<BktButtonVariant, string> = {
  primary: 'var(--primary-hover)',
  secondary: 'var(--bkt-slate-200)',
  outline: 'var(--bkt-slate-50)',
  ghost: 'var(--bkt-slate-100)',
  danger: 'var(--bkt-danger-ink)',
  success: 'var(--bkt-success-ink)',
}

export function BktButton({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  loading = false,
  disabled = false,
  fullWidth = false,
  style = {},
  className = '',
  ...rest
}: BktButtonProps) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5em',
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition:
      'transform var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
    userSelect: 'none',
  }

  const ref = useRef<HTMLButtonElement>(null)
  const onEnter = () => {
    if (ref.current && !disabled && !loading) ref.current.style.background = HOVER_BG[variant]
  }
  const onLeave = () => {
    if (ref.current) ref.current.style.background = String(VARIANTS[variant].background ?? '')
  }
  const onDown = () => {
    if (ref.current && !disabled && !loading) ref.current.style.transform = 'scale(var(--press-scale, 0.97))'
  }
  const onUp = () => {
    if (ref.current) ref.current.style.transform = 'scale(1)'
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onMouseEnter={onEnter}
      onMouseLeave={() => {
        onLeave()
        onUp()
      }}
      onMouseDown={onDown}
      onMouseUp={onUp}
      className={['bkt-touch', className].filter(Boolean).join(' ')}
      data-bkt-icon={size === 'icon' ? '' : undefined}
      style={{ ...base, ...SIZES[size], ...VARIANTS[variant], ...style }}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 15,
        height: 15,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.45)',
        borderTopColor: '#fff',
        display: 'inline-block',
        animation: 'bkt-spin 0.7s linear infinite',
      }}
    />
  )
}
