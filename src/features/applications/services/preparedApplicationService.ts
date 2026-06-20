// BKT AI-Apply — prepared-application READ/TRIGGER service (ADR-013).
//
// The client-side counterpart to the headless-prep pipeline. It reads the
// RLS-scoped prepared_applications + prepared_application_fields rows the
// `prepare-application` Edge Function writes, and lets the user kick off an
// on-demand prep for a single job. It performs NO sensitive logic itself — the
// gating decision and the BR-156 review_gate invariant are server/DB authority.
//
// Mirrors candidateProfileWriteService.ts:
//   BR-004 — all DB access via the single getSupabaseClientSafe()
//   BR-005 — every query scoped by user_id (RLS own-row + explicit filter)
//   BR-082 — DB types come from generated db.types.ts (no handwritten DB types)
//   BR-122 — the on-demand prep call goes through supabase.functions.invoke,
//            which attaches the user's own JWT; no service-role/provider key is
//            ever referenced here.
//
// ADR-013 Decision 6 — prep is NOT event-sourced into application_events and
// changes no applications.stage, so this service writes no events (BR-002 is
// untouched). The discovery → applied event is written by the existing submit
// flow when the human actually submits.
//
// When Supabase is unconfigured getSupabaseClientSafe() returns null and the
// reads resolve to empty while triggerPrepare throws a clear, catchable error,
// so the design-review UAT stays interactive without a backend.

import { getSupabaseClientSafe } from '@/lib/supabase'
import { readEdgeFunctionError } from '@/lib/edgeFunctionError'
import type { Tables } from '@/types/db.types'

export type PreparedApplicationRow = Tables<'prepared_applications'>
export type PreparedApplicationFieldRow = Tables<'prepared_application_fields'>

/** A prepared application together with its mapped fields (review surface input). */
export interface PreparedApplicationWithFields {
  app: PreparedApplicationRow
  fields: PreparedApplicationFieldRow[]
}

/** The job reference the user passes when kicking off an on-demand prep. Mirrors
 *  the `job_ref` jsonb shape + the optional job_id FK; the Edge Function resolves
 *  the ATS family / read endpoint from source_url server-side. */
export interface TriggerPrepareInput {
  jobId?: string | null
  jobRef: {
    source_board?: string
    source_url: string
    external_job_id?: string
  }
}

/** The shape the `prepare-application` Edge Function returns on success: the
 *  freshly written prepared row plus its mapped fields. Kept permissive (the
 *  Edge Function owns the contract) but typed enough for callers to consume. */
export interface TriggerPrepareResult {
  prepared: PreparedApplicationRow
  fields: PreparedApplicationFieldRow[]
}

/** Raised when the on-demand prep Edge Function fails, carrying the real,
 *  human-readable cause read off the response body (never the bare transport
 *  string). Lets the hook surface a specific message instead of masking it. */
export class PrepareApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrepareApplicationError'
  }
}

/** Loads the user's prepared applications, newest first. Empty when none / when
 *  Supabase is unconfigured. Scoped by user_id (RLS + explicit filter, BR-005). */
export async function fetchPreparedApplications(
  userId: string,
): Promise<PreparedApplicationRow[]> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('prepared_applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Loads one prepared application and its mapped fields, scoped by user_id so a
 *  caller can never read another user's prep (RLS + explicit filter). Returns
 *  null when the row does not exist (or Supabase is unconfigured). Fields are
 *  ordered review-gated first, then by field_key for a stable, review-friendly
 *  order. */
export async function fetchPreparedApplicationWithFields(
  userId: string,
  preparedApplicationId: string,
): Promise<PreparedApplicationWithFields | null> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId || !preparedApplicationId) return null

  const { data: app, error: appError } = await supabase
    .from('prepared_applications')
    .select('*')
    .eq('user_id', userId)
    .eq('id', preparedApplicationId)
    .maybeSingle()
  if (appError) throw new Error(appError.message)
  if (!app) return null

  const { data: fields, error: fieldsError } = await supabase
    .from('prepared_application_fields')
    .select('*')
    .eq('user_id', userId)
    .eq('prepared_application_id', preparedApplicationId)
    .order('review_gate', { ascending: false })
    .order('field_key', { ascending: true })
  if (fieldsError) throw new Error(fieldsError.message)

  return { app: app as PreparedApplicationRow, fields: (fields ?? []) as PreparedApplicationFieldRow[] }
}

/** Kicks off an on-demand prep for a single job via the `prepare-application`
 *  Edge Function. functions.invoke attaches the user's own JWT (BR-122); the
 *  function writes the RLS-scoped prep rows as the caller and applies the
 *  server-authoritative gating policy + the BR-156 sensitive-field gate. user_id
 *  is NOT sent in the body — the server trusts the JWT, never client input
 *  (BR-005). Throws PrepareApplicationError with the real cause on failure. */
export async function triggerPrepare(input: TriggerPrepareInput): Promise<TriggerPrepareResult> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) {
    throw new PrepareApplicationError(
      'Supabase is not configured — connect a backend to prepare applications.',
    )
  }

  const { data, error } = await supabase.functions.invoke<TriggerPrepareResult>('prepare-application', {
    body: {
      prepared_by: 'on_demand',
      job_id: input.jobId ?? null,
      job_ref: input.jobRef,
    },
  })

  if (error) {
    const message = await readEdgeFunctionError(error, 'Could not prepare this application.')
    throw new PrepareApplicationError(message)
  }
  if (!data) {
    throw new PrepareApplicationError('prepare-application returned an empty response.')
  }
  return data
}

/** Updates the status of one prepared application, scoped by user_id so the
 *  update can never reach another user's row (RLS + explicit filter, BR-005).
 *  Used by the review surface to mark a record stale/ready after human action;
 *  the terminal `submitted` transition is owned by the submit flow, not here. */
export async function updatePreparedStatus(
  userId: string,
  preparedApplicationId: string,
  status: PreparedApplicationRow['status'],
): Promise<void> {
  const supabase = getSupabaseClientSafe()
  if (!supabase || !userId || !preparedApplicationId) return
  const { error } = await supabase
    .from('prepared_applications')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', preparedApplicationId)
  if (error) throw new Error(error.message)
}
