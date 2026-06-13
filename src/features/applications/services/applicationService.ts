import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'
import type { PipelineStage } from '../../../types/pipeline'
import { canTransitionStage } from '../domain/stageRules'
import { deriveSubmittedCount } from './submittedCount'

export type ApplicationRow = Database['public']['Tables']['applications']['Row'] & {
  jobs: {
    title: string
    company_id: string
    companies: { name: string } | null
  } | null
}

export type AuditEventRow = Database['public']['Tables']['application_events']['Row']

export async function fetchApplications(userId: string): Promise<ApplicationRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*, jobs(title, company_id, companies(name))')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ApplicationRow[]
}

/**
 * Counts the user's submitted applications straight from `applications` DB
 * truth (Phase 2b dashboard honesty). Replaces the localStorage submitted
 * delta. Returns 0 on any error so the dashboard degrades gracefully rather
 * than throwing in the stat row.
 */
export async function fetchSubmittedCount(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('applications')
    .select('stage, submitted_at')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  return deriveSubmittedCount(
    (data ?? []) as { stage: string; submitted_at: string | null }[],
  )
}

export async function transitionStage(params: {
  applicationId: string
  userId: string
  fromStage: PipelineStage
  toStage: PipelineStage
  reason: string
  actor?: string
}): Promise<void> {
  const { applicationId, userId, fromStage, toStage, reason, actor = 'jb_manual' } = params

  if (!canTransitionStage(fromStage, toStage)) {
    throw new Error(`Invalid stage transition: ${fromStage} → ${toStage}`)
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('transition_stage', {
    p_application_id: applicationId,
    p_user_id: userId,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_reason: reason,
    p_actor: actor,
  })

  if (error) {
    throw new Error(`Stage transition failed: ${error.message}`)
  }
}

export async function fetchAuditLog(
  applicationId: string,
  userId: string,
): Promise<AuditEventRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('application_events')
    .select('*')
    .eq('application_id', applicationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as AuditEventRow[]
}
