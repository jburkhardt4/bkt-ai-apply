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
 *
 * Terminal stages (rejected/ghosted) are ambiguous — `discovery → rejected` is a
 * valid never-submitted dismissal and the live submission path does not stamp
 * `submitted_at` — so they are resolved against the event log: such a row counts
 * only when a `stage_transition` INTO `applied` exists for it (BR-133).
 */
export async function fetchSubmittedCount(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('applications')
    .select('id, stage, submitted_at')
    .eq('user_id', userId)

  if (error) return 0

  const apps = (data ?? []) as { id: string; stage: string; submitted_at: string | null }[]

  // Resolve ambiguous terminals (rejected/ghosted with no submitted_at) against
  // the event log so a submitted-then-rejected application still counts, while a
  // dismissed-from-discovery one does not.
  const ambiguousIds = apps
    .filter((a) => a.submitted_at == null && (a.stage === 'rejected' || a.stage === 'ghosted'))
    .map((a) => a.id)

  let everSubmittedIds: Set<string> | undefined
  if (ambiguousIds.length > 0) {
    const { data: events, error: eventsError } = await supabase
      .from('application_events')
      .select('application_id')
      .eq('user_id', userId)
      .eq('event_type', 'stage_transition')
      .eq('to_stage', 'applied')
      .in('application_id', ambiguousIds)

    if (!eventsError) {
      everSubmittedIds = new Set(
        (events ?? [])
          .map((e) => e.application_id)
          .filter((id): id is string => id != null),
      )
    }
  }

  return deriveSubmittedCount(apps, everSubmittedIds)
}

/** Per-tab exact counts for the Dashboard sections (All / Review / In progress /
 *  Applied / Declined), computed server-side so the badges show "True Numbers"
 *  independent of how many rows a paged/limited list fetch has loaded (Phase A
 *  groundwork; Phase D refines the exact Action-Required semantics).
 *
 *  Mirrors the dashboard's existing status derivation (autoApplyService):
 *    - review     = stage 'discovery' WITHOUT a manual-apply marker
 *    - inProgress = stage 'discovery' WITH a manual-apply marker (view overlay)
 *    - applied    = DB-truth submitted count (reuses fetchSubmittedCount, BR-133)
 *    - declined   = stage in ('rejected', 'ghosted')
 *    - all        = total applications for the user
 *  Returns zeros on any error so the badges degrade gracefully. */
export interface ApplicationStageCounts {
  all: number
  review: number
  inProgress: number
  applied: number
  declined: number
}

export async function fetchApplicationStageCounts(
  userId: string,
): Promise<ApplicationStageCounts> {
  const empty: ApplicationStageCounts = { all: 0, review: 0, inProgress: 0, applied: 0, declined: 0 }
  const supabase = getSupabaseClient()

  try {
    // Head-only counts (no rows transferred) + the DB-truth submitted count + the
    // bounded set of manual-apply markers (only manually-opened rows carry one).
    const [allRes, discoveryRes, declinedRes, applied, markersRes] = await Promise.all([
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('stage', 'discovery'),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('stage', ['rejected', 'ghosted']),
      fetchSubmittedCount(userId),
      supabase
        .from('application_events')
        .select('application_id')
        .eq('user_id', userId)
        .eq('event_type', 'submission_attempt')
        .eq('metadata->>outcome', 'in_progress')
        .eq('metadata->>source', 'manual-apply'),
    ])

    const all = allRes.count ?? 0
    const discovery = discoveryRes.count ?? 0
    const declined = declinedRes.count ?? 0

    // Of the manually-opened applications, count those still at 'discovery' — these
    // are the 'In progress' overlay rows (matches fetchJobMatches exactly).
    const markerIds = Array.from(
      new Set(
        ((markersRes.data ?? []) as { application_id: string | null }[])
          .map((m) => m.application_id)
          .filter((id): id is string => id != null),
      ),
    )

    let inProgress = 0
    if (markerIds.length > 0) {
      const { count } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('stage', 'discovery')
        .in('id', markerIds)
      inProgress = count ?? 0
    }

    return {
      all,
      review: Math.max(0, discovery - inProgress),
      inProgress,
      applied,
      declined,
    }
  } catch {
    return empty
  }
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
