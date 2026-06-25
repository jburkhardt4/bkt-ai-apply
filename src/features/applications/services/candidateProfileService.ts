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
// RESUME TEXT SOURCE: scoring reads the user's master resume as plain text from a
// `.txt` object — either candidate_profiles.master_resume_path (when it is a .txt)
// or the latest versioned `documents` resume row (document storage always writes
// text/plain). PDF/DOCX uploads now reach scoring because the builder extracts
// their text CLIENT-SIDE (resumeFileExtractor) and persists it here via
// saveUploadedResumeText() — closing the BR-150 follow-up. When no plain-text
// resume exists we return null and scoring falls back exactly as before.

import { getSupabaseClient } from '../../../lib/supabase'
import { createDocumentVersion } from './documentStorageService'

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

/** Minimum length for a persisted resume to be worth scoring against. */
const MIN_RESUME_CHARS = 30

/**
 * Persists an uploaded resume's CLIENT-EXTRACTED text as a new plain-text
 * `documents` resume version, so match-scoring (fetchCandidateResumeText →
 * buildScoringProfile → score-job-fit) uses the candidate's real resume instead
 * of the keyword fallback. Best-effort + non-blocking: returns false on any
 * failure (scoring then proceeds exactly as before). BR-150 / BR-162.
 */
export async function saveUploadedResumeText(userId: string, text: string): Promise<boolean> {
  const trimmed = text?.trim()
  if (!userId || !trimmed || trimmed.length < MIN_RESUME_CHARS) return false
  try {
    await createDocumentVersion({ userId, documentType: 'resume', content: trimmed })
    return true
  } catch {
    return false
  }
}
