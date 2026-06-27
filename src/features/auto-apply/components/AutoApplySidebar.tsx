// BKT AI-Apply — left navigation sidebar.
// Ported 1:1 from the design-system UI kit (Shell.jsx), extended with a
// "Platform" group so the pre-existing operational pages (Pipeline,
// Ingestion, Prospector, Integrations) stay reachable inside the redesign.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import { ChevronBadge } from '@/components/bkt/ChevronBadge'
import { brandAsset } from '../assets'
import type { NavKey } from '../types'

interface NavItemDef {
  icon: string
  label: string
  key: NavKey
}

const NAV: { group: string; items: NavItemDef[] }[] = [
  {
    group: 'Auto Apply',
    items: [
      { icon: 'layout-dashboard', label: 'Dashboard', key: 'dashboard' },
      { icon: 'mail', label: 'Inbox', key: 'inbox' },
      { icon: 'search', label: 'Job Search', key: 'search' },
      { icon: 'bookmark', label: 'Saved Jobs', key: 'saved' },
      { icon: 'sliders-horizontal', label: 'Preferences', key: 'prefs' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { icon: 'file-text', label: 'Resumes', key: 'resumes' },
      { icon: 'pen-line', label: 'Cover Letters', key: 'letters' },
    ],
  },
  {
    group: 'Interview',
    items: [{ icon: 'graduation-cap', label: 'Interview Prep', key: 'interview-prep' }],
  },
  {
    group: 'Platform',
    items: [
      { icon: 'kanban', label: 'Pipeline', key: 'pipeline' },
      { icon: 'upload', label: 'Ingestion', key: 'ingestion' },
      { icon: 'plug', label: 'Integrations', key: 'integrations' },
    ],
  },
]

function NavItem({
  icon,
  label,
  badge,
  count,
  active,
  onClick,
}: {
  icon: string
  label: string
  badge?: ReactNode
  count?: ReactNode
  active: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 38,
        padding: '0 12px',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--sidebar-accent)' : hover ? 'var(--bkt-slate-50)' : 'transparent',
        color: active ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
        font: `${active ? 600 : 500} var(--text-base)/1 var(--font-body)`,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background var(--dur-fast) var(--ease-standard)',
      }}
    >
      <Icon name={icon} size={17} strokeWidth={active ? 2 : 1.8} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {badge != null && badge}
      {count != null && (
        <BktBadge tone="danger" appearance="solid" style={{ background: '#cb112d', border: '1px solid transparent' }}>
          {count}
        </BktBadge>
      )}
    </div>
  )
}

export interface AutoApplySidebarProps {
  active: NavKey
  onNavigate: (key: NavKey) => void
  userName: string
  userEmail?: string | null
  /** Review-queue size shown on Dashboard; unread count shown on Inbox. */
  badges?: Partial<Record<NavKey, number>>
  onSignOut?: () => void
  /** Opens the platform AI assistant overlay (chat agent). */
  onOpenAssistant?: () => void
  /** Rendered inside the mobile nav drawer: pad the top/bottom for the notch +
   *  home indicator. Inert on desktop (the inset tokens resolve to 0px). */
  safeArea?: boolean
}

export function AutoApplySidebar({ active, onNavigate, userName, userEmail, badges = {}, onSignOut, onOpenAssistant, safeArea = false }: AutoApplySidebarProps) {
  return (
    <aside
      className="bkt-scroll"
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--sidebar-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: safeArea
          ? 'calc(16px + var(--safe-top)) 12px calc(12px + var(--safe-bottom))'
          : '16px 12px 12px',
        gap: 4,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 8px 14px' }}>
        <img src={brandAsset('/brand/bkt-web-app-logo.png')} alt="BKT shield" style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 7 }} />
        <span style={{ font: '700 var(--text-md)/1 var(--font-display)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text-strong)' }}>
          BKT <span style={{ color: 'var(--primary)' }}>AI-Apply</span>
        </span>
      </div>

      {NAV.map((g) => (
        <div key={g.group} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
          <div className="bkt-eyebrow" style={{ padding: '0 12px 6px' }}>
            {g.group}
          </div>
          {g.items.map((it) => (
            <NavItem
              key={it.key}
              icon={it.icon}
              label={it.label}
              badge={it.key === 'dashboard' && badges.dashboard ? <ChevronBadge count={badges.dashboard} /> : undefined}
              count={it.key === 'inbox' && badges.inbox ? badges.inbox : undefined}
              active={active === it.key}
              onClick={() => onNavigate(it.key)}
            />
          ))}
        </div>
      ))}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {onOpenAssistant && <NavItem icon="bot" label="AI Assistant" active={false} onClick={onOpenAssistant} />}
        <NavItem
          icon="bell"
          label="Notifications"
          count={badges.notifications}
          onClick={() => onNavigate('notifications')}
          active={active === 'notifications'}
        />
        {onSignOut && <NavItem icon="log-out" label="Sign out" active={false} onClick={onSignOut} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px 4px', borderTop: '1px solid var(--border)' }}>
          <span
            title={userEmail ?? undefined}
            style={{ display: 'inline-block', width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2.5px solid var(--bkt-blue-700)' }}
          >
            <img
              src={brandAsset('/brand/avatar.jpg')}
              alt={userName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
            />
          </span>
          <span
            style={{
              flex: 1,
              font: '600 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-strong)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {userName}
          </span>
          <BktBadge tone="neutral" appearance="outline">
            Auto Apply
          </BktBadge>
        </div>
      </div>
    </aside>
  )
}
