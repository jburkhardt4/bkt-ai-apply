// BKT AI-Apply — mobile top bar. Rendered only under 768px (see AppShell),
// it replaces the always-on 224px sidebar with a hamburger that opens the nav
// as a slide-in drawer, keeping the brand wordmark and quick access to the AI
// assistant + notifications. Presentational only (zero data fetching) per the
// src/components/ contract; all handlers are supplied by AppShell.
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { brandAsset } from '@/features/auto-apply/assets'

export interface MobileTopBarProps {
  onMenu: () => void
  onAssistant: () => void
  onNotifications: () => void
  /** Unread/action-required count — shows a dot on the bell when > 0. */
  notifCount?: number
}

export function MobileTopBar({ onMenu, onAssistant, onNotifications, notifCount = 0 }: MobileTopBarProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <BktButton variant="ghost" size="icon" aria-label="Open navigation" onClick={onMenu} style={{ width: 44, height: 44 }}>
        <Icon name="menu" size={20} />
      </BktButton>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
        <img
          src={brandAsset('/brand/bkt-web-app-logo.png')}
          alt="BKT shield"
          style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 7, flexShrink: 0 }}
        />
        <span
          style={{
            font: '700 var(--text-md)/1 var(--font-display)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--text-strong)',
            whiteSpace: 'nowrap',
          }}
        >
          BKT <span style={{ color: 'var(--primary)' }}>AI-Apply</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <BktButton variant="ghost" size="icon" aria-label="AI assistant" onClick={onAssistant} style={{ width: 44, height: 44 }}>
          <Icon name="bot" size={20} />
        </BktButton>
        <BktButton
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          onClick={onNotifications}
          style={{ width: 44, height: 44, position: 'relative' }}
        >
          <Icon name="bell" size={20} />
          {notifCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 9,
                right: 9,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--bkt-danger)',
                border: '2px solid var(--surface)',
              }}
            />
          )}
        </BktButton>
      </div>
    </header>
  )
}
