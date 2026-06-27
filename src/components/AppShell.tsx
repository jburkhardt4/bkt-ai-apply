// BKT AI-Apply — application shell, redesigned to the BKT design system
// (ui_kits/ai-apply). Left: design-system sidebar (Auto Apply / Documents /
// Interview / Platform groups + user footer). Main: the routed page.
// The AI chat agent from the previous shell is preserved as a right-hand
// slide-over, launched from the sidebar's "AI Assistant" item.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useOverlay } from '@/hooks/useOverlay'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { useAuth } from '@/contexts/auth-context'
import { AiAssistantPanel } from '@/features/ai-agent/components/AiAssistantPanel'
import { SelectedApplicationContext } from '@/contexts/selected-application-context'
import { BktToastProvider } from '@/components/bkt/toast'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { AutoApplySidebar } from '@/features/auto-apply/components/AutoApplySidebar'
import { AutoApplySettingsProvider } from '@/features/auto-apply/components/AutoApplySettingsProvider'
import { MobileTopBar } from '@/components/MobileTopBar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { navigate, useNavKey } from '@/features/auto-apply/router'
import { fetchActionRequiredCount } from '@/features/applications/services/actionRequiredService'
import type { NavKey } from '@/features/auto-apply/types'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { loading, user, signOut } = useAuth()
  const navKey = useNavKey()
  const isMobile = useIsMobile()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [badges, setBadges] = useState<Partial<Record<NavKey, number>>>({})
  const navDrawerRef = useRef<HTMLDivElement>(null)
  const assistantRef = useRef<HTMLElement>(null)
  // Escape-to-close, scroll-lock, and focus management for the two shell overlays.
  useOverlay(isMobile && navOpen, () => setNavOpen(false), navDrawerRef)
  useOverlay(assistantOpen, () => setAssistantOpen(false), assistantRef)
  // On iOS the keyboard overlays the layout viewport; reserve its height so the
  // assistant composer stays visible. 0 on desktop / when no keyboard is shown.
  const keyboardInset = useKeyboardInset()

  // Unified "Action Required" nav badge — the centralized bottleneck count
  // (unreviewed matches + interviews + offers + unread recruiter inbox). The
  // Dashboard item shows the total; Inbox shows its needing-reply portion.
  useEffect(() => {
    let alive = true
    const userId = user?.id ?? null
    if (!userId) return
    fetchActionRequiredCount(userId)
      .then((ar) => {
        if (!alive) return
        setBadges({ dashboard: ar.total, inbox: ar.inbox })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [user?.id])

  // Redirect unauthenticated users to /login — but with a short grace window so a
  // late INITIAL_SESSION / token-refresh from onAuthStateChange can still deliver
  // the session that getSession() missed on a cold sub-route load. Without it,
  // deep-linking or refreshing a protected route races auth hydration and bounces
  // to /login (audit §6 #5). If the session arrives, `user` changes, this effect
  // re-runs and the cleanup cancels the pending bounce.
  useEffect(() => {
    if (loading || user) return
    const timer = setTimeout(() => {
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login')
    }, 1200)
    return () => clearTimeout(timer)
  }, [loading, user])

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', minHeight: '100svh', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)', animation: 'bkt-fade-up 1s var(--ease-out) infinite alternate' }}>
          Loading…
        </span>
      </div>
    )
  }

  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Account'

  const handleSignOut = async () => {
    await signOut()
    window.location.assign('/login')
  }

  return (
    <SelectedApplicationContext.Provider value={{ selectedApplicationId, setSelectedApplicationId }}>
      <BktToastProvider>
        <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden', background: 'var(--background)' }}>
          {!isMobile && (
            <AutoApplySidebar
              active={navKey}
              onNavigate={navigate}
              userName={userName}
              userEmail={user.email}
              badges={badges}
              onSignOut={() => void handleSignOut()}
              onOpenAssistant={() => setAssistantOpen(true)}
            />
          )}
          <main
            className="bkt-scroll bkt-app-main"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              // Reserve space for the fixed mobile tab bar + home indicator so the
              // bottom of scroll content isn't occluded. Both vars are 0 on desktop.
              paddingBottom: 'calc(var(--tabbar-h) + var(--safe-bottom))',
            }}
          >
            {isMobile && (
              <MobileTopBar
                onMenu={() => setNavOpen(true)}
                onAssistant={() => setAssistantOpen(true)}
                onNotifications={() => navigate('notifications')}
                notifCount={(badges.dashboard ?? 0) + (badges.inbox ?? 0)}
              />
            )}
            <AutoApplySettingsProvider>{children}</AutoApplySettingsProvider>
          </main>
        </div>

        {/* Mobile bottom tab bar — thumb-zone access to the top destinations;
            "More" opens the same nav drawer for the long tail. */}
        {isMobile && (
          <MobileTabBar
            active={navKey}
            onNavigate={navigate}
            onMore={() => setNavOpen(true)}
            badges={badges}
          />
        )}

        {/* Mobile nav drawer — sidebar as a left slide-in overlay (reuses the
            AI-assistant slide-over pattern; left-origin animation). Selecting a
            nav item closes the drawer before navigating. */}
        {isMobile && navOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', justifyContent: 'flex-start' }}>
            <div
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'rgba(0, 24, 72, 0.30)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}
            ></div>
            <div
              ref={navDrawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              tabIndex={-1}
              style={{
                position: 'relative',
                height: '100%',
                display: 'flex',
                outline: 'none',
                animation: 'bkt-drawer-slide-in var(--dur-medium) var(--ease-out) both',
                boxShadow: 'var(--shadow-xl)',
              }}
            >
              <AutoApplySidebar
                safeArea
                active={navKey}
                onNavigate={(k) => {
                  setNavOpen(false)
                  navigate(k)
                }}
                userName={userName}
                userEmail={user.email}
                badges={badges}
                onSignOut={() => void handleSignOut()}
                onOpenAssistant={() => {
                  setNavOpen(false)
                  setAssistantOpen(true)
                }}
              />
            </div>
          </div>
        )}

        {/* AI assistant slide-over (platform chat agent) */}
        {assistantOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'flex-end' }}>
            <div
              onClick={() => setAssistantOpen(false)}
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, background: 'rgba(0, 24, 72, 0.18)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}
            ></div>
            <section
              ref={assistantRef}
              role="dialog"
              aria-modal="true"
              aria-label="AI Assistant"
              tabIndex={-1}
              style={{
                position: 'relative',
                width: 'min(420px, 92vw)',
                height: '100%',
                background: 'var(--surface)',
                boxShadow: 'var(--shadow-xl)',
                display: 'flex',
                flexDirection: 'column',
                outline: 'none',
                animation: 'bkt-jd-slide-in var(--dur-medium) var(--ease-out) both',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(14px + var(--safe-top)) 18px 14px', borderBottom: '1px solid var(--border)' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    background: 'var(--bkt-gradient-shield, var(--primary))',
                    borderRadius: 'var(--radius-lg)',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="bot" size={16} />
                </span>
                <span style={{ flex: 1, font: '700 var(--text-sm)/1.2 var(--font-display)', color: 'var(--text-strong)' }}>AI Assistant</span>
                <BktButton variant="ghost" size="icon" aria-label="Close assistant" onClick={() => setAssistantOpen(false)}>
                  <Icon name="x" size={16} />
                </BktButton>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: `16px 16px calc(16px + var(--safe-bottom) + ${keyboardInset}px)` }}>
                <AiAssistantPanel selectedApplicationId={selectedApplicationId} />
              </div>
            </section>
          </div>
        )}
      </BktToastProvider>
    </SelectedApplicationContext.Provider>
  )
}
