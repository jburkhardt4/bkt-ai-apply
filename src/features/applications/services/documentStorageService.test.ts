import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import {
  createDocumentVersion,
  deleteDocument,
  linkDocumentsToApplication,
  listDocuments,
  updateDocumentContent,
} from './documentStorageService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

describe('documentStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments document version per user and document type when creating a new version', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ version: 2 }], error: null })
    const order = vi.fn(() => ({ limit }))
    const eqSecond = vi.fn(() => ({ order }))
    const eqFirst = vi.fn(() => ({ eq: eqSecond }))
    const selectForVersion = vi.fn(() => ({ eq: eqFirst }))

    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'doc-3',
        user_id: 'user-1',
        storage_path: 'user-1/resume/v3-deadbeef.txt',
        document_type: 'resume',
        version: 3,
        content_hash: 'abc123',
        is_locked: false,
        created_at: '2026-06-05T00:00:00.000Z',
      },
      error: null,
    })
    const selectForInsert = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select: selectForInsert }))

    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: selectForVersion }))
      .mockImplementationOnce(() => ({ insert }))

    const upload = vi.fn().mockResolvedValue({ data: { path: 'uploaded' }, error: null })
    const remove = vi.fn().mockResolvedValue({ data: null, error: null })
    const storageFrom = vi.fn(() => ({ upload, remove }))

    mockGetSupabaseClient.mockReturnValue({
      from,
      storage: {
        from: storageFrom,
      },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await createDocumentVersion({
      userId: 'user-1',
      documentType: 'resume',
      content: 'resume body',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        document_type: 'resume',
        version: 3,
      }),
    )
    expect(upload).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    expect(result.version).toBe(3)
  })

  it('links and locks resume/cover-letter documents after packet approval flow', async () => {
    const insertMaterials = vi.fn().mockResolvedValue({ error: null })
    const inClause = vi.fn().mockResolvedValue({ error: null })
    const eqClause = vi.fn(() => ({ in: inClause }))
    const updateDocuments = vi.fn(() => ({ eq: eqClause }))

    const from = vi
      .fn()
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('application_materials')
        return { insert: insertMaterials }
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('documents')
        return { update: updateDocuments }
      })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await linkDocumentsToApplication({
      userId: 'user-1',
      applicationId: 'app-1',
      resumeDocumentId: 'resume-doc-1',
      coverLetterDocumentId: 'cover-doc-1',
    })

    expect(insertMaterials).toHaveBeenCalledWith([
      expect.objectContaining({
        application_id: 'app-1',
        document_id: 'resume-doc-1',
        material_type: 'resume',
        is_primary: true,
      }),
      expect.objectContaining({
        application_id: 'app-1',
        document_id: 'cover-doc-1',
        material_type: 'cover_letter',
        is_primary: true,
      }),
    ])
    expect(updateDocuments).toHaveBeenCalledWith({ is_locked: true })
    expect(inClause).toHaveBeenCalledWith('id', ['resume-doc-1', 'cover-doc-1'])
  })

  it('listDocuments returns newest-first documents with their downloaded text', async () => {
    const rows = [
      { id: 'doc-2', document_type: 'resume', version: 2, storage_path: 'user-1/resume/v2.txt', created_at: '2026-06-02T00:00:00.000Z', is_locked: false },
      { id: 'doc-1', document_type: 'resume', version: 1, storage_path: 'user-1/resume/v1.txt', created_at: '2026-06-01T00:00:00.000Z', is_locked: false },
    ]
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
    const order = vi.fn(() => ({ limit }))
    const eqType = vi.fn(() => ({ order }))
    const eqUser = vi.fn(() => ({ eq: eqType }))
    const select = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ select }))
    const download = vi
      .fn()
      .mockResolvedValueOnce({ data: { text: async () => 'v2 body' }, error: null })
      .mockResolvedValueOnce({ data: { text: async () => 'v1 body' }, error: null })
    const storageFrom = vi.fn(() => ({ download }))

    mockGetSupabaseClient.mockReturnValue({
      from,
      storage: { from: storageFrom },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await listDocuments('user-1', 'resume')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ documentId: 'doc-2', version: 2, text: 'v2 body' })
    expect(result[1]).toMatchObject({ documentId: 'doc-1', version: 1, text: 'v1 body' })
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqType).toHaveBeenCalledWith('document_type', 'resume')
  })

  it('listDocuments returns [] without a user (no query)', async () => {
    expect(await listDocuments('', 'resume')).toEqual([])
  })

  it('updateDocumentContent overwrites the same object in place and refreshes content_hash', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn(() => ({ upload }))
    const eqUser = vi.fn().mockResolvedValue({ error: null })
    const eqId = vi.fn(() => ({ eq: eqUser }))
    const update = vi.fn(() => ({ eq: eqId }))
    const from = vi.fn(() => ({ update }))

    mockGetSupabaseClient.mockReturnValue({
      from,
      storage: { from: storageFrom },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const result = await updateDocumentContent({
      userId: 'user-1',
      documentId: 'doc-2',
      storagePath: 'user-1/resume/v2.txt',
      content: 'edited body',
    })
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(upload).toHaveBeenCalledWith('user-1/resume/v2.txt', 'edited body', { upsert: true, contentType: 'text/plain' })
    expect(eqId).toHaveBeenCalledWith('id', 'doc-2')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('deleteDocument removes the storage object and the row (RLS-scoped)', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const storageFrom = vi.fn(() => ({ remove }))
    const eqUser = vi.fn().mockResolvedValue({ error: null })
    const eqId = vi.fn(() => ({ eq: eqUser }))
    const del = vi.fn(() => ({ eq: eqId }))
    const from = vi.fn(() => ({ delete: del }))

    mockGetSupabaseClient.mockReturnValue({
      from,
      storage: { from: storageFrom },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await deleteDocument({ userId: 'user-1', documentId: 'doc-2', storagePath: 'user-1/resume/v2.txt' })
    expect(remove).toHaveBeenCalledWith(['user-1/resume/v2.txt'])
    expect(eqId).toHaveBeenCalledWith('id', 'doc-2')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
  })
})