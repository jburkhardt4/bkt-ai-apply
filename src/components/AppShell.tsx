// BKT AI-Apply — application shell, redesigned to the BKT design system
// (ui_kits/ai-apply). Left: design-system sidebar (Auto Apply / Documents /
// Interview / Platform groups + user footer). Main: the routed page.
// The AI chat agent from the previous shell is preserved as a right-hand
// slide-over, launched from the sidebar's "AI Assistant" item.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { AiAssistantPanel } from '@/features/ai-agent/components/AiAssistantPanel'
import { SelectedApplicationContext } from '@/contexts/selected-application-context'
import { BktToastProvider } from '@/components/bkt/toast'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { AutoApplySidebar } from '@/features/auto-apply/components/AutoApplySidebar'
import { AutoApplySettingsProvider } from '@/features/auto-apply/components/AutoApplySettingsProvider'
import { navigate, useNavKey } from '@/features/auto-apply/router'
import { fetchActionRequiredCount } from '@/features/applications/services/actionRequiredService'
import type { NavKey } from '@/features/auto-apply/types'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { loading, user, signOut } = useAuth()
  const navKey = useNavKey()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [badges, setBadges] = useState<Partial<Record<NavKey, number>>>({})

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

  useEffect(() => {
    if (!loading && !user) {
      window.location.assign('/login')
    }
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
        <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>
          <AutoApplySidebar
            active={navKey}
            onNavigate={navigate}
            userName={userName}
            userEmail={user.email}
            badges={badges}
            onSignOut={() => void handleSignOut()}
            onOpenAssistant={() => setAssistantOpen(true)}
          />
          <main className="bkt-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <AutoApplySettingsProvider>{children}</AutoApplySettingsProvider>
          </main>
        </div>

        {/* AI assistant slide-over (platform chat agent) */}
        {assistantOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'flex-end' }}>
            <div
              onClick={() => setAssistantOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0, 24, 72, 0.18)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}
            ></div>
            <section
              style={{
                position: 'relative',
                width: 'min(420px, 92vw)',
                height: '100%',
                background: 'var(--surface)',
                boxShadow: 'var(--shadow-xl)',
                display: 'flex',
                flexDirection: 'column',
                animation: 'bkt-jd-slide-in var(--dur-medium) var(--ease-out) both',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
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
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16 }}>
                <AiAssistantPanel selectedApplicationId={selectedApplicationId} />
              </div>
            </section>
          </div>
        )}
      </BktToastProvider>
    </SelectedApplicationContext.Provider>
  )
}
