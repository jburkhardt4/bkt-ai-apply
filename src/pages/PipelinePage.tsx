import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { AiCostMonitorCard } from '../features/applications/components/AiCostMonitorCard'
import { AnalyticsReportsSection } from '../features/applications/components/AnalyticsReportsSection'
import { AuditLogViewer } from '../features/applications/components/AuditLogViewer'
import { ChatAssistantPanel } from '../features/applications/components/ChatAssistantPanel'
import { DashboardSummarySection } from '../features/applications/components/DashboardSummarySection'
import { NotificationFeedSection } from '../features/applications/components/NotificationFeedSection'
import { PipelineBoard } from '../features/applications/components/PipelineBoard'
import { SubmissionGatePanel } from '../features/applications/components/SubmissionGatePanel'
import { getSupabaseClient } from '../lib/supabase'

export default function PipelinePage() {
  const { user, loading, signOut } = useAuth()
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
    }
  }, [loading, user])

  useEffect(() => {
    if (!user) return

    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`pipeline-dashboard-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${user.id}` },
        () => setRefreshKey((value) => value + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'application_events', filter: `user_id=eq.${user.id}` },
        () => setRefreshKey((value) => value + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interviews', filter: `user_id=eq.${user.id}` },
        () => setRefreshKey((value) => value + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setRefreshKey((value) => value + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_model_usage', filter: `user_id=eq.${user.id}` },
        () => setRefreshKey((value) => value + 1),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: 'var(--ink-subtle)',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!user) {
    return null
  }

  async function handleSignOut() {
    try {
      await signOut()
      window.location.href = '/login'
    } catch {
      // ignore sign-out errors; redirect anyway
      window.location.href = '/login'
    }
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem 1.25rem 3rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontSize: '0.7rem',
              color: 'var(--ink-subtle)',
              fontWeight: 700,
            }}
          >
            BKT AI-Apply
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
              margin: '0.2rem 0 0',
              color: 'var(--ink-strong)',
            }}
          >
            Application Pipeline
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => {
              window.location.href = '/ingestion'
            }}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            Ingestion
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-subtle)' }}>{user.email}</span>
          <button
            onClick={() => void handleSignOut()}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <DashboardSummarySection refreshKey={refreshKey} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        <AiCostMonitorCard refreshKey={refreshKey} />
        <NotificationFeedSection refreshKey={refreshKey} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1rem',
        }}
      >
        <AnalyticsReportsSection refreshKey={refreshKey} />
        <ChatAssistantPanel selectedApplicationId={selectedApplicationId} />
      </div>

      <PipelineBoard
        selectedApplicationId={selectedApplicationId}
        onSelectApplication={setSelectedApplicationId}
      />

      {selectedApplicationId && (
        <SubmissionGatePanel
          applicationId={selectedApplicationId}
          onApproved={() => setRefreshKey((value) => value + 1)}
        />
      )}

      {selectedApplicationId && (
        <div
          style={{
            marginTop: '1.5rem',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            background: 'var(--surface)',
          }}
        >
          <AuditLogViewer applicationId={selectedApplicationId} refreshKey={refreshKey} />
        </div>
      )}
    </div>
  )
}
