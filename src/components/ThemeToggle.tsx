// BKT AI-Apply — color-theme control. A compact segmented switch
// (Light / System / Dark) over the bkt design tokens. Presentational chrome
// that reads global theme state from the ThemeContext (same pattern as the
// shell consuming useAuth). Icon-only by default for dense placements (the
// sidebar footer); pass `labels` for the roomier Preferences surface.
import type { CSSProperties } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { useTheme } from '@/contexts/theme-context'
import type { ThemeMode } from '@/lib/theme'

const OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'light', icon: 'sun', label: 'Light' },
  { mode: 'system', icon: 'monitor', label: 'System' },
  { mode: 'dark', icon: 'moon', label: 'Dark' },
]

export interface ThemeToggleProps {
  /** Show the text label beside each icon (Preferences); off = icon-only (chrome). */
  labels?: boolean
  style?: CSSProperties
}

export function ThemeToggle({ labels = false, style }: ThemeToggleProps) {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        background: 'var(--surface-muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill)',
        ...style,
      }}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={`${o.label} theme`}
            onClick={() => setMode(o.mode)}
            className="bkt-press bkt-touch"
            data-bkt-icon
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: labels ? 7 : 0,
              height: 32,
              minWidth: 32,
              width: labels ? 'auto' : 32,
              padding: labels ? '0 13px' : 0,
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text-strong)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
              font: '600 var(--text-sm)/1 var(--font-body)',
              transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
            }}
          >
            <Icon name={o.icon} size={15} />
            {labels && <span>{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
