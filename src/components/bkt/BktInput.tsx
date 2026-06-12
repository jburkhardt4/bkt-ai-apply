// BKT AI-Apply — Input (ported from the BKT design system)
// Text field with optional leading icon, label, hint/error, and a
// navy focus ring.
import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface BktInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  iconLeft?: ReactNode
  iconRight?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const HEIGHTS = { sm: 36, md: 42, lg: 48 } as const

export function BktInput({
  label = null,
  hint = null,
  error = null,
  iconLeft = null,
  iconRight = null,
  size = 'md',
  style = {},
  id,
  ...rest
}: BktInputProps) {
  const [focused, setFocused] = useState(false)
  const autoId = useId()
  const fid = id ?? autoId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <label htmlFor={fid} style={{ font: '600 var(--text-sm)/1.2 var(--font-body)', color: 'var(--text-body)' }}>
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: HEIGHTS[size],
          padding: '0 12px',
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--bkt-danger)' : focused ? 'var(--primary)' : 'var(--input)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: focused ? 'var(--shadow-focus)' : 'var(--shadow-xs)',
          transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
          ...style,
        }}
      >
        {iconLeft && <span style={{ display: 'inline-flex', color: 'var(--text-subtle)' }}>{iconLeft}</span>}
        <input
          id={fid}
          {...rest}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            font: '400 var(--text-base)/1.4 var(--font-body)',
            color: 'var(--text-strong)',
          }}
        />
        {iconRight && <span style={{ display: 'inline-flex', color: 'var(--text-subtle)' }}>{iconRight}</span>}
      </div>
      {(hint || error) && (
        <span style={{ font: '400 var(--text-xs)/1.3 var(--font-body)', color: error ? 'var(--bkt-danger-ink)' : 'var(--text-muted)' }}>
          {error || hint}
        </span>
      )}
    </div>
  )
}
