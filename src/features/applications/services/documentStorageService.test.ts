import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { createDocumentVersion, linkDocumentsToApplication } from './documentStorageService'

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
})