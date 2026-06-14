import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import {
  approvePreparedPacket,
  writeApprovalEvent,
} from './submissionApprovalService'
import { linkDocumentsToApplication } from './documentStorageService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('./documentStorageService', () => ({
  createDocumentVersion: vi.fn(),
  linkDocumentsToApplication: vi.fn(),
}))

vi.mock('./documentGenerationService', () => ({
  generateResumeVariant: vi.fn(),
  generateCoverLetter: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)
const mockLinkDocumentsToApplication = vi.mocked(linkDocumentsToApplication)

describe('submissionApprovalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes approval event with actor and event_type required by AC-006-04', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mockGetSupabaseClient.mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await writeApprovalEvent({
      userId: 'user-1',
      applicationId: 'app-1',
      matchScore: 85,
      resumeDocumentId: 'resume-doc-1',
      coverLetterDocumentId: 'cover-doc-1',
      approvedAtIso: '2026-06-05T10:00:00.000Z',
    })

    expect(rpc).toHaveBeenCalledWith(
      'write_approval_event',
      expect.objectContaining({
        p_application_id: 'app-1',
      }),
    )
  })

  it('links documents before writing the approval event', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mockGetSupabaseClient.mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await approvePreparedPacket({
      userId: 'user-1',
      applicationId: 'app-1',
      matchScore: 82,
      resumeDocumentId: 'resume-doc-1',
      coverLetterDocumentId: 'cover-doc-1',
      approvedAtIso: '2026-06-05T10:00:00.000Z',
    })

    expect(mockLinkDocumentsToApplication).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      resumeDocumentId: 'resume-doc-1',
      coverLetterDocumentId: 'cover-doc-1',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})