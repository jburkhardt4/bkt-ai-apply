import { getSupabaseClient } from '../../../lib/supabase'
import type { Database, Json } from '../../../types/db.types'

export type StoredDocumentType = 'resume' | 'cover_letter'

const DOCUMENTS_BUCKET = 'documents'
const VERSION_RETRY_LIMIT = 3

type DocumentRow = Database['public']['Tables']['documents']['Row']

export interface CreateDocumentVersionInput {
  userId: string
  documentType: StoredDocumentType
  content: string
  /** Optional builder formatting config (bullet toggles + custom sections). */
  builderConfig?: Json | null
}

export interface StoredDocumentVersion {
  documentId: string
  documentType: StoredDocumentType
  version: number
  storagePath: string
  contentHash: string
  isLocked: boolean
  createdAt: string
  content: string
}

export interface LinkDocumentsInput {
  userId: string
  applicationId: string
  resumeDocumentId: string
  coverLetterDocumentId: string
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const payload = encoder.encode(value)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return toHex(new Uint8Array(digest))
}

async function fetchLatestVersion(userId: string, documentType: StoredDocumentType): Promise<number> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('documents')
    .select('version')
    .eq('user_id', userId)
    .eq('document_type', documentType)
    .order('version', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to read latest document version: ${error.message}`)
  }

  return data?.[0]?.version ?? 0
}

function buildStoragePath(params: {
  userId: string
  documentType: StoredDocumentType
  version: number
  contentHash: string
}): string {
  const suffix = Date.now().toString(36)
  return `${params.userId}/${params.documentType}/v${params.version}-${params.contentHash.slice(0, 12)}-${suffix}.txt`
}

async function cleanupStoragePath(path: string): Promise<void> {
  const supabase = getSupabaseClient()
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
}

function toStoredDocumentVersion(row: DocumentRow, content: string): StoredDocumentVersion {
  return {
    documentId: row.id,
    documentType: row.document_type as StoredDocumentType,
    version: row.version,
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    isLocked: row.is_locked,
    createdAt: row.created_at,
    content,
  }
}

export async function createDocumentVersion(input: CreateDocumentVersionInput): Promise<StoredDocumentVersion> {
  const supabase = getSupabaseClient()
  const contentHash = await sha256(input.content)

  for (let attempt = 0; attempt < VERSION_RETRY_LIMIT; attempt += 1) {
    const latestVersion = await fetchLatestVersion(input.userId, input.documentType)
    const nextVersion = latestVersion + 1
    const storagePath = buildStoragePath({
      userId: input.userId,
      documentType: input.documentType,
      version: nextVersion,
      contentHash,
    })

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, input.content, {
        upsert: false,
        contentType: 'text/plain',
      })

    if (uploadError) {
      throw new Error(`Failed to upload document content: ${uploadError.message}`)
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: input.userId,
        storage_path: storagePath,
        document_type: input.documentType,
        version: nextVersion,
        content_hash: contentHash,
        builder_config: input.builderConfig ?? null,
      })
      .select('*')
      .single()

    if (!error) {
      return toStoredDocumentVersion(data, input.content)
    }

    await cleanupStoragePath(storagePath)

    if (isUniqueViolation(error)) {
      continue
    }

    throw new Error(`Failed to create document row: ${error.message}`)
  }

  throw new Error('Failed to create a new document version after retries.')
}

export interface LoadedDocument {
  documentId: string
  documentType: StoredDocumentType
  version: number
  storagePath: string
  createdAt: string
  isLocked: boolean
  text: string
  /** Original uploaded filename, e.g. "John Burkhardt - Resume - 6.2026.pdf". */
  fileName: string | null
  mimeType: string | null
  /** Storage path of the ACTUAL uploaded file (binary) for the real viewer. */
  originalPath: string | null
  builderConfig: Json | null
}

/** Downloads a documents-bucket object as text, or null on any failure. */
async function downloadDocumentText(path: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
    if (error || !data) return null
    return await data.text()
  } catch {
    return null
  }
}

/**
 * Lists the user's documents of a type (newest version first) WITH their stored
 * text, so the Documents screen shows real, RLS-scoped documents instead of demo
 * seed. Best-effort: returns [] on error. Capped to keep the initial load light.
 */
export async function listDocuments(
  userId: string,
  documentType: StoredDocumentType,
  limit = 12,
): Promise<LoadedDocument[]> {
  if (!userId) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('documents')
    .select('id, document_type, version, storage_path, created_at, is_locked, file_name, mime_type, original_path, builder_config')
    .eq('user_id', userId)
    .eq('document_type', documentType)
    // Locked rows are submission artifacts (linked to an application) — not part
    // of the editable resume library, so they never appear here.
    .eq('is_locked', false)
    .order('version', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  const out: LoadedDocument[] = []
  for (const row of data) {
    const text = (await downloadDocumentText(row.storage_path)) ?? ''
    out.push({
      documentId: row.id,
      documentType: row.document_type as StoredDocumentType,
      version: row.version,
      storagePath: row.storage_path,
      createdAt: row.created_at,
      isLocked: row.is_locked,
      text,
      fileName: row.file_name,
      mimeType: row.mime_type,
      originalPath: row.original_path,
      builderConfig: row.builder_config,
    })
  }
  return out
}

/**
 * Overwrites an existing document version's content IN PLACE (same storage object
 * + refreshed content_hash). Used for builder autosave so a single editing session
 * does not spawn a new version on every keystroke. RLS-scoped to the caller.
 */
export async function updateDocumentContent(input: {
  userId: string
  documentId: string
  storagePath: string
  content: string
  builderConfig?: Json | null
}): Promise<{ contentHash: string }> {
  const supabase = getSupabaseClient()
  const contentHash = await sha256(input.content)

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(input.storagePath, input.content, { upsert: true, contentType: 'text/plain' })
  if (uploadError) {
    throw new Error(`Failed to update document content: ${uploadError.message}`)
  }

  const patch: Database['public']['Tables']['documents']['Update'] = { content_hash: contentHash }
  if (input.builderConfig !== undefined) patch.builder_config = input.builderConfig

  const { error } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', input.documentId)
    .eq('user_id', input.userId)
  if (error) {
    throw new Error(`Failed to update document row: ${error.message}`)
  }
  return { contentHash }
}

/** Deletes a document (both storage objects + row), RLS-scoped to the caller. */
export async function deleteDocument(input: {
  userId: string
  documentId: string
  storagePath: string
  originalPath?: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  const paths = [input.storagePath, input.originalPath].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths)
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', input.documentId)
    .eq('user_id', input.userId)
  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`)
  }
}

/** A short-lived signed URL for viewing/downloading a private documents object. */
export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, expiresInSeconds)
    if (error || !data) return null
    return data.signedUrl
  } catch {
    return null
  }
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  return ext || 'bin'
}

export interface UploadDocumentFileInput {
  userId: string
  documentType: StoredDocumentType
  /** The original uploaded file (binary kept as-is for the real viewer). */
  file: File
  /** Text extracted client-side (resumeFileExtractor) — the scoring/builder source. */
  extractedText: string
}

/**
 * Stores an uploaded document as the user's REAL file: the original binary (for
 * the in-app viewer/download) PLUS its extracted text as a `.txt` (so job-scoring
 * and the builder are unchanged). One `documents` row carries `file_name`,
 * `mime_type`, `original_path` (binary) and `storage_path` (.txt). RLS-scoped.
 */
export async function uploadDocumentFile(input: UploadDocumentFileInput): Promise<StoredDocumentVersion> {
  const supabase = getSupabaseClient()
  const text = input.extractedText ?? ''
  const contentHash = await sha256(text || input.file.name)
  const ext = fileExtension(input.file.name)

  for (let attempt = 0; attempt < VERSION_RETRY_LIMIT; attempt += 1) {
    const version = (await fetchLatestVersion(input.userId, input.documentType)) + 1
    const stamp = Date.now().toString(36)
    const hash12 = contentHash.slice(0, 12)
    const textPath = `${input.userId}/${input.documentType}/v${version}-${hash12}-${stamp}.txt`
    const originalPath = `${input.userId}/files/v${version}-${hash12}-${stamp}.${ext}`

    const original = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(originalPath, input.file, {
        upsert: false,
        contentType: input.file.type || 'application/octet-stream',
      })
    if (original.error) {
      throw new Error(`Failed to upload original file: ${original.error.message}`)
    }

    const textUpload = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(textPath, text, { upsert: false, contentType: 'text/plain' })
    if (textUpload.error) {
      await cleanupStoragePath(originalPath)
      throw new Error(`Failed to upload document text: ${textUpload.error.message}`)
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: input.userId,
        storage_path: textPath,
        document_type: input.documentType,
        version,
        content_hash: contentHash,
        file_name: input.file.name,
        mime_type: input.file.type || null,
        original_path: originalPath,
      })
      .select('*')
      .single()

    if (!error) {
      return toStoredDocumentVersion(data, text)
    }

    await cleanupStoragePath(originalPath)
    await cleanupStoragePath(textPath)
    if (isUniqueViolation(error)) continue
    throw new Error(`Failed to create document row: ${error.message}`)
  }

  throw new Error('Failed to upload document after retries.')
}

export async function linkDocumentsToApplication(input: LinkDocumentsInput): Promise<void> {
  const supabase = getSupabaseClient()
  const documentIds = [input.resumeDocumentId, input.coverLetterDocumentId]

  const { error: linkError } = await supabase.from('application_materials').insert([
    {
      application_id: input.applicationId,
      document_id: input.resumeDocumentId,
      material_type: 'resume',
      is_primary: true,
    },
    {
      application_id: input.applicationId,
      document_id: input.coverLetterDocumentId,
      material_type: 'cover_letter',
      is_primary: true,
    },
  ])

  if (linkError) {
    throw new Error(`Failed to link documents to application: ${linkError.message}`)
  }

  const { error: lockError } = await supabase
    .from('documents')
    .update({ is_locked: true })
    .eq('user_id', input.userId)
    .in('id', documentIds)

  if (lockError) {
    throw new Error(`Failed to lock linked documents: ${lockError.message}`)
  }
}