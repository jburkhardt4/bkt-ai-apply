import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { useSelectedApplication } from '../contexts/selected-application-context'
import { AiCostMonitorCard } from '../features/applications/components/AiCostMonitorCard'
import { AnalyticsReportsSection } from '../features/applications/components/AnalyticsReportsSection'
import { AuditLogViewer } from '../features/applications/components/AuditLogViewer'
import { DashboardSummarySection } from '../features/applications/components/DashboardSummarySection'
import { NotificationFeedSection } from '../features/applications/components/NotificationFeedSection'
import { PipelineBoard } from '../features/applications/components/PipelineBoard'
import { SubmissionGatePanel } from '../features/applications/components/SubmissionGatePanel'
import { Card } from '@/components/ui/card'
import { getSupabaseClient } from '../lib/supabase'

export default function PipelinePage() {
  const { user } = useAuth()
  const { selectedApplicationId, setSelectedApplicationId } = useSelectedApplication()
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!user) return

    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`pipeline-dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${user.id}` }, () => setRefreshKey((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'application_events', filter: `user_id=eq.${user.id}` }, () => setRefreshKey((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews', filter: `user_id=eq.${user.id}` }, () => setRefreshKey((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => setRefreshKey((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_model_usage', filter: `user_id=eq.${user.id}` }, () => setRefreshKey((v) => v + 1))
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [user])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          BKT AI-Apply
        </p>
        <h1
          className="mt-1 text-2xl font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Application Pipeline
        </h1>
      </div>

      <DashboardSummarySection refreshKey={refreshKey} />

      <div className="grid gap-4 md:grid-cols-2">
        <AiCostMonitorCard refreshKey={refreshKey} />
        <NotificationFeedSection refreshKey={refreshKey} />
      </div>

      <AnalyticsReportsSection refreshKey={refreshKey} />

      <PipelineBoard
        selectedApplicationId={selectedApplicationId}
        onSelectApplication={setSelectedApplicationId}
      />

      {selectedApplicationId && (
        <SubmissionGatePanel
          applicationId={selectedApplicationId}
          onApproved={() => setRefreshKey((v) => v + 1)}
        />
      )}

      {selectedApplicationId && (
        <Card className="p-4">
          <AuditLogViewer applicationId={selectedApplicationId} refreshKey={refreshKey} />
        </Card>
      )}
    </div>
  )
}
