// BKT AI-Apply — Avatar (ported from the BKT design system)
// Image or initials, optional brand ring + status dot; falls back to
// initials on missing/broken image.
import { useState } from 'react'
import type { HTMLAttributes } from 'react'

export interface BktAvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string | null
  name?: string
  size?: number
  ring?: boolean
  status?: 'online' | 'busy' | 'offline' | null
  square?: boolean
}

export function BktAvatar({
  src = null,
  name = '',
  size = 40,
  ring = false,
  status = null,
  square = false,
  style = {},
  ...rest
}: BktAvatarProps) {
  const [broken, setBroken] = useState(false)
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => (w[0] ?? '').toUpperCase())
      .join('') || '?'
  const showImg = Boolean(src) && !broken

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, ...style }} {...rest}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: square ? 'var(--radius-md)' : '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: showImg ? 'transparent' : 'var(--bkt-gradient-shield)',
          color: '#fff',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: size * 0.38,
          letterSpacing: '-0.01em',
          boxShadow: ring ? '0 0 0 2px var(--surface), 0 0 0 4px var(--primary)' : 'none',
        }}
      >
        {showImg ? (
          <img
            src={src ?? undefined}
            alt={name}
            onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          initials
        )}
      </span>
      {status && (
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: Math.max(8, size * 0.26),
            height: Math.max(8, size * 0.26),
            borderRadius: '50%',
            background:
              status === 'online' ? 'var(--bkt-success)' : status === 'busy' ? 'var(--bkt-warning)' : 'var(--bkt-slate-400)',
            border: '2px solid var(--surface)',
          }}
        />
      )}
    </span>
  )
}
