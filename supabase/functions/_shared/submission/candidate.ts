/**
 * Candidate resolution for the submission worker (ADR-006, GAP-010 closure).
 *
 * The worker (service-role) calls this once per distinct user in a run to build
 * the `CandidatePayload` the ATS adapters need: the `candidate_profiles` row plus
 * the master résumé PDF downloaded from the `documents` storage bucket. All DB /
 * storage I/O lives here (and in the worker) — the adapters stay pure (LSN-004).
 *
 * Returns null only when there is no profile row at all. A profile with empty
 * required fields (email/phone) still resolves; the adapters' `missing[]` check
 * then withholds any real send — so an unseeded profile fails safe, never sends.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CandidatePayload } from './types.ts'

const DOCUMENTS_BUCKET = 'documents'

/** Split "John Q Burkhardt" → first "John", last "Q Burkhardt". */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export async function resolveCandidatePayload(
  supabase: SupabaseClient,
  userId: string,
): Promise<CandidatePayload | null> {
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select(
      'full_name, email, phone, location, linkedin_url, website_url, work_authorization, master_resume_path',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null

  // Download the master résumé bytes when a path is set (best-effort: a missing
  // file leaves resume null, and the adapters' missing[] check withholds send).
  let resume: CandidatePayload['resume'] = null
  const masterPath = (data.master_resume_path as string | null) ?? null
  if (masterPath) {
    const { data: file, error: dlErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(masterPath)
    if (!dlErr && file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const filename = masterPath.split('/').pop() || 'resume.pdf'
      resume = { bytes, filename, contentType: file.type || 'application/pdf' }
    }
  }

  const fullName = (data.full_name as string | null) ?? ''
  const { firstName, lastName } = splitName(fullName)

  return {
    firstName,
    lastName,
    fullName,
    email: (data.email as string | null) ?? '',
    phone: (data.phone as string | null) ?? '',
    location: (data.location as string | null) ?? '',
    linkedinUrl: (data.linkedin_url as string | null) ?? null,
    websiteUrl: (data.website_url as string | null) ?? null,
    workAuthorization: (data.work_authorization as string | null) ?? '',
    resume,
    resumePath: masterPath,
  }
}

/** Per-run cache so a multi-row batch resolves each user's profile once. */
export function makeCandidateCache(): Map<string, CandidatePayload | null> {
  return new Map()
}

export async function getCandidateCached(
  supabase: SupabaseClient,
  userId: string,
  cache: Map<string, CandidatePayload | null>,
): Promise<CandidatePayload | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null
  const resolved = await resolveCandidatePayload(supabase, userId)
  cache.set(userId, resolved)
  return resolved
}
