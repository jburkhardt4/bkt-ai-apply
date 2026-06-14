// BKT AI-Apply — Auto-Apply settings service (Phase 2 data backbone).
// Reads/writes the single `user_settings` row (credits, monthly budget,
// review mode, paused, last auto-apply target), replacing the previous
// localStorage persistence. Single-client rule: all access goes through
// getSupabaseClientSafe(); when Supabase is unconfigured it returns the
// in-memory defaults and writes no-op, so the UI stays reviewable.
import { getSupabaseClientSafe } from '@/lib/supabase'
import type { Json, TablesInsert } from '@/types/db.types'
import type { ReviewModeId, SearchJob } from '../types'
import { JOBS_SEED } from '../data/jobsData'
import { SEARCH_SEED } from '../data/searchData'

/** View-model shape consumed by the dashboard/route hooks. */
export interface AutoApplySettings {
  credits: number
  budget: number
  reviewMode: ReviewModeId
  paused: boolean
  lastTarget: SearchJob
  autoSubmitScoreThreshold: number
}

const DEFAULT_TARGET: SearchJob = SEARCH_SEED.jobs.find((j) => j.id === 's7') ?? SEARCH_SEED.jobs[0]!

export const DEFAULT_SETTINGS: AutoApplySettings = {
  credits: JOBS_SEED.user.credits,
  budget: 240,
  reviewMode: 'review',
  paused: false,
  lastTarget: DEFAULT_TARGET,
  autoSubmitScoreThreshold: 80,
}

interface SettingsRow {
  credits: number | null
  monthly_budget_usd: number | null
  review_mode: string | null
  paused: boolean | null
  last_target_job: Json | null
  auto_submit_score_threshold: number | null
}

export async function fetchSettings(userId: string): Promise<AutoApplySettings> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) return DEFAULT_SETTINGS
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('credits, monthly_budget_usd, review_mode, paused, last_target_job, auto_submit_score_threshold')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return DEFAULT_SETTINGS
    const row = data as SettingsRow
    return {
      credits: row.credits ?? DEFAULT_SETTINGS.credits,
      budget: row.monthly_budget_usd ?? DEFAULT_SETTINGS.budget,
      reviewMode: (row.review_mode as ReviewModeId | null) ?? DEFAULT_SETTINGS.reviewMode,
      paused: row.paused ?? DEFAULT_SETTINGS.paused,
      lastTarget: (row.last_target_job as SearchJob | null) ?? DEFAULT_SETTINGS.lastTarget,
      autoSubmitScoreThreshold: row.auto_submit_score_threshold ?? DEFAULT_SETTINGS.autoSubmitScoreThreshold,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Upserts only the changed columns onto the user's settings row. */
export async function persistSettings(userId: string, patch: Partial<AutoApplySettings>): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) return
  const row: TablesInsert<'user_settings'> = { user_id: userId }
  if (patch.credits !== undefined) row.credits = patch.credits
  if (patch.budget !== undefined) row.monthly_budget_usd = patch.budget
  if (patch.reviewMode !== undefined) row.review_mode = patch.reviewMode
  if (patch.paused !== undefined) row.paused = patch.paused
  if (patch.lastTarget !== undefined) row.last_target_job = patch.lastTarget as unknown as Json
  const { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}
