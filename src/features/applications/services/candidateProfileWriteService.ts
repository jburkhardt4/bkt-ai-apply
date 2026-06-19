// BKT AI-Apply — candidate profile + answer-library WRITE service.
//
// Self-service persistence for the Preferences screen. This is the read/write
// counterpart to candidateProfileService.ts (which stays the focused master
// resume-text resolver); the two are intentionally not merged.
//
// Hard rules honored:
//   BR-004 — all DB access via the single getSupabaseClientSafe()
//   BR-005 — every query is scoped by user_id (candidate_profiles +
//            application_answers are RLS-scoped; we filter explicitly too)
//   BR-082 — DB types come from generated db.types.ts (no handwritten DB types)
//
// When Supabase is unconfigured getSupabaseClientSafe() returns null and the
// fetches resolve to empty / null while the writes no-op, so the design-review
// UAT stays interactive without a backend (mirrors settingsService.ts).

import { getSupabaseClientSafe } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/db.types'

/** The four fields the UI edits on an answer-library row (id/timestamps are
 *  DB-managed; user_id is supplied separately and never trusted from input). */
export type ApplicationAnswerInput = Pick<
  TablesInsert<'application_answers'>,
  'question_key' | 'question_label' | 'answer' | 'answer_type'
>

/** Loads the user's single candidate_profiles row, or null when none exists
 *  (or Supabase is unconfigured). Never throws on the not-found path. */
export async function fetchCandidateProfile(
  userId: string,
): Promise<Tables<'candidate_profiles'> | null> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Upserts the changed identity/eligibility/eeo columns onto the user's single
 *  candidate_profiles row (UNIQUE user_id → onConflict 'user_id'). The caller
 *  passes only the columns it is changing; user_id is always forced from the
 *  trusted argument so the patch can never target another user (BR-005). */
export async function upsertCandidateProfile(
  userId: string,
  patch: Partial<TablesInsert<'candidate_profiles'>>,
): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return
  const row: TablesInsert<'candidate_profiles'> = { ...patch, user_id: userId }
  const { error } = await supabase
    .from('candidate_profiles')
    .upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

/** Loads all of the user's application_answers rows (custom screener answers),
 *  oldest first for a stable editor order. Empty when none / unconfigured. */
export async function fetchApplicationAnswers(
  userId: string,
): Promise<Tables<'application_answers'>[]> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('application_answers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Upserts a single answer keyed by (user_id, question_key). user_id is forced
 *  from the trusted argument (BR-005); question_key is the stable slug derived
 *  from the label so editing an existing row updates in place. */
export async function upsertApplicationAnswer(
  userId: string,
  answer: ApplicationAnswerInput,
): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return
  const row: TablesInsert<'application_answers'> = { ...answer, user_id: userId }
  const { error } = await supabase
    .from('application_answers')
    .upsert(row, { onConflict: 'user_id,question_key' })
  if (error) throw new Error(error.message)
}

/** Deletes one of the user's answer rows by question_key (scoped by user_id so
 *  the delete can never reach another user's row, RLS + explicit filter). */
export async function deleteApplicationAnswer(
  userId: string,
  questionKey: string,
): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return
  const { error } = await supabase
    .from('application_answers')
    .delete()
    .eq('user_id', userId)
    .eq('question_key', questionKey)
  if (error) throw new Error(error.message)
}
