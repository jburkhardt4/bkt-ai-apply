import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { AuditLogViewer } from '../features/applications/components/AuditLogViewer'
import { PipelineBoard } from '../features/applications/components/PipelineBoard'
import { SubmissionGatePanel } from '../features/applications/components/SubmissionGatePanel'

export default function PipelinePage() {
  const { user, loading, signOut } = useAuth()
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [auditRefreshKey, setAuditRefreshKey] = useState(0)

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
    }
  }, [loading, user])

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

      <PipelineBoard
        selectedApplicationId={selectedApplicationId}
        onSelectApplication={setSelectedApplicationId}
      />

      {selectedApplicationId && (
        <SubmissionGatePanel
          applicationId={selectedApplicationId}
          onApproved={() => setAuditRefreshKey((value) => value + 1)}
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
          <AuditLogViewer applicationId={selectedApplicationId} refreshKey={auditRefreshKey} />
        </div>
      )}
    </div>
  )
}
