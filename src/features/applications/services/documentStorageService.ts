import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'

export type StoredDocumentType = 'resume' | 'cover_letter'

const DOCUMENTS_BUCKET = 'documents'
const VERSION_RETRY_LIMIT = 3

type DocumentRow = Database['public']['Tables']['documents']['Row']

export interface CreateDocumentVersionInput {
  userId: string
  documentType: StoredDocumentType
  content: string
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