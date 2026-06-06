import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'

type ApplicationRow = Pick<
  Database['public']['Tables']['applications']['Row'],
  'created_at' | 'match_score' | 'stage'
>

export interface DashboardMetricsSummary {
  generatedAtIso: string
  weekStartIso: string
  applicationsThisWeek: number
  activeInterviews: number
  pendingApprovals: number
  aiConfidenceAverage: number | null
  rejectionCount: number
}

function getUtcWeekStartIso(now = new Date()): string {
  const utcDay = now.getUTCDay()
  const daysSinceMonday = (utcDay + 6) % 7
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)
  weekStart.setUTCHours(0, 0, 0, 0)

  return weekStart.toISOString()
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return Number((total / values.length).toFixed(1))
}

export async function getDashboardMetrics(userId: string): Promise<DashboardMetricsSummary> {
  const supabase = getSupabaseClient()
  const weekStartIso = getUtcWeekStartIso()

  const [applicationsResult, interviewsResult, approvalsResult] = await Promise.all([
    supabase
      .from('applications')
      .select('created_at, match_score, stage')
      .eq('user_id', userId),
    supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['scheduled', 'rescheduled']),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('notification_type', 'approval_needed')
      .eq('is_read', false),
  ])

  const { data: applicationRows, error: applicationError } = applicationsResult
  if (applicationError) {
    throw new Error(`Failed to load dashboard applications: ${applicationError.message}`)
  }

  const { count: activeInterviewCount, error: interviewError } = interviewsResult
  if (interviewError) {
    throw new Error(`Failed to load active interview count: ${interviewError.message}`)
  }

  const { count: pendingApprovalCount, error: approvalError } = approvalsResult
  if (approvalError) {
    throw new Error(`Failed to load pending approval count: ${approvalError.message}`)
  }

  const applications = (applicationRows ?? []) as ApplicationRow[]
  const applicationCountThisWeek = applications.filter(
    (application) => application.created_at >= weekStartIso,
  ).length
  const rejectionCount = applications.filter((application) => application.stage === 'rejected').length
  const confidenceValues = applications
    .map((application) => application.match_score)
    .filter((score): score is number => typeof score === 'number')

  return {
    generatedAtIso: new Date().toISOString(),
    weekStartIso,
    applicationsThisWeek: applicationCountThisWeek,
    activeInterviews: activeInterviewCount ?? 0,
    pendingApprovals: pendingApprovalCount ?? 0,
    aiConfidenceAverage: average(confidenceValues),
    rejectionCount,
  }
}