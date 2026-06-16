// BKT AI-Apply — candidate profile resume-text resolver (Phase 2a)
//
// Best-effort retrieval of the user's master resume as PLAIN TEXT so the LLM
// match-scoring profile can use the real resume (authoritative over the keyword
// lists) instead of only the hardcoded masterProfile keywords.
//
// Hard rules honored:
//   BR-004 — all DB / storage access via the single getSupabaseClient()
//   BR-005 — every query is scoped by user_id (candidate_profiles + documents
//            are RLS-scoped; we filter explicitly too)
//   BR-082 — DB types come from generated db.types.ts (no handwritten DB types)
//
// NO PDF PARSING: the repo ships no PDF text-extraction library and must not add
// one. candidate_profiles.master_resume_path is documented as the JB-provided
// master resume PDF; we only read it as text when the path is itself a .txt.
// Otherwise we fall back to the latest versioned `documents` resume row, whose
// content the document storage service always writes as text/plain (.txt). When
// only a PDF (or nothing) is available we return null and scoring proceeds
// exactly as before (resume enrichment is inert until a .txt resume exists).

import { getSupabaseClient } from '../../../lib/supabase'

/** Cap to protect the match_scoring token budget (BR-050/054). ~12k chars is a
 *  generous full-resume length while keeping tokens_in modest. */
const MAX_RESUME_CHARS = 12_000

const DOCUMENTS_BUCKET = 'documents'

function isTextPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.trim().toLowerCase().endsWith('.txt')
}

function clampResume(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_RESUME_CHARS ? trimmed.slice(0, MAX_RESUME_CHARS) : trimmed
}

/** Downloads a storage object from the documents bucket and returns its text,
 *  or null on any failure (missing object, network, empty). */
async function downloadText(path: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
    if (error || !data) return null
    const text = await data.text()
    const clamped = clampResume(text)
    return clamped.length > 0 ? clamped : null
  } catch {
    return null
  }
}

/**
 * Resolves the current user's master resume as plain text, or null when no
 * plain-text resume is available. Never throws.
 *
 * Resolution order:
 *   1. candidate_profiles.master_resume_path, when it is a .txt object.
 *   2. The latest `documents` row with document_type = 'resume' whose
 *      storage_path is a .txt object (versioned descending).
 */
export async function fetchCandidateResumeText(userId: string): Promise<string | null> {
  if (!userId) return null
  try {
    const supabase = getSupabaseClient()

    // 1) Prefer the explicit master resume path, but only if it is plain text.
    const { data: profile } = await supabase
      .from('candidate_profiles')
      .select('master_resume_path')
      .eq('user_id', userId)
      .maybeSingle()

    if (isTextPath(profile?.master_resume_path)) {
      const fromMaster = await downloadText(profile.master_resume_path)
      if (fromMaster) return fromMaster
    }

    // 2) Fall back to the latest versioned resume document with .txt content.
    const { data: docs } = await supabase
      .from('documents')
      .select('storage_path, version')
      .eq('user_id', userId)
      .eq('document_type', 'resume')
      .order('version', { ascending: false })
      .limit(5)

    for (const doc of docs ?? []) {
      if (!isTextPath(doc.storage_path)) continue
      const fromDoc = await downloadText(doc.storage_path)
      if (fromDoc) return fromDoc
    }

    return null
  } catch {
    return null
  }
}
