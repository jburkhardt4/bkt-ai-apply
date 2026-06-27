// BKT AI-Apply — mobile bottom tab bar (thumb-zone navigation).
// Rendered only under 768px (see AppShell), fixed to the bottom edge with a
// home-indicator safe-area inset. Surfaces the highest-traffic destinations;
// "More" opens the existing nav drawer for the long tail (Documents, Platform).
// Presentational only (zero data fetching) per the src/components/ contract —
// all handlers + badge counts are supplied by AppShell.
import type { CSSProperties } from 'react'
import { Icon } from '@/components/bkt/Icon'
import type { NavKey } from '@/features/auto-apply/types'

interface TabDef {
  icon: string
  label: string
  key: NavKey
}

// A deliberately curated subset with compact labels (not the full sidebar NAV).
// Keys are typed as NavKey, so a renamed route fails the build rather than
// silently diverging.
const TABS: TabDef[] = [
  { icon: 'layout-dashboard', label: 'Home', key: 'dashboard' },
  { icon: 'mail', label: 'Inbox', key: 'inbox' },
  { icon: 'search', label: 'Search', key: 'search' },
  { icon: 'bookmark', label: 'Saved', key: 'saved' },
]

export interface MobileTabBarProps {
  active: NavKey
  onNavigate: (key: NavKey) => void
  /** Opens the full nav drawer for destinations not on the bar. */
  onMore: () => void
  badges?: Partial<Record<NavKey, number>>
}

const itemStyle: CSSProperties = {
  flex: 1,
  minHeight: 56,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  WebkitTapHighlightColor: 'transparent',
}

const labelStyle: CSSProperties = { font: '500 10px/1 var(--font-body)' }

function CountDot({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -4,
        right: -9,
        minWidth: 16,
        height: 16,
        padding: '0 4px',
        borderRadius: 999,
        background: 'var(--bkt-danger)',
        color: '#fff',
        font: '600 10px/16px var(--font-body)',
        textAlign: 'center',
        border: '2px solid var(--surface)',
        boxSizing: 'content-box',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function MobileTabBar({ active, onNavigate, onMore, badges = {} }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        // Bar sits flush to the screen bottom; pad the home indicator so the
        // touch row stays above it. --safe-bottom is 0 on non-notch devices.
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.key
        const count = badges[t.key] ?? 0
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onNavigate(t.key)}
            className="bkt-press"
            aria-label={t.label}
            aria-current={isActive ? 'page' : undefined}
            style={{ ...itemStyle, color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={t.icon} size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              {count > 0 && <CountDot count={count} />}
            </span>
            <span style={labelStyle}>{t.label}</span>
          </button>
        )
      })}
      <button type="button" onClick={onMore} className="bkt-press" aria-label="More" style={{ ...itemStyle, color: 'var(--text-muted)' }}>
        <Icon name="menu" size={22} strokeWidth={1.8} />
        <span style={labelStyle}>More</span>
      </button>
    </nav>
  )
}
