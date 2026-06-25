import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocumentVersion } from './documentStorageService'
import { saveUploadedResumeText } from './candidateProfileService'

vi.mock('./documentStorageService', () => ({ createDocumentVersion: vi.fn() }))
const mockCreate = vi.mocked(createDocumentVersion)

describe('saveUploadedResumeText', () => {
  beforeEach(() => mockCreate.mockReset())

  it('persists the extracted resume as a trimmed text version and returns true', async () => {
    mockCreate.mockResolvedValue({} as never)
    const ok = await saveUploadedResumeText('user-1', '   A sufficiently long resume body text.   ')
    expect(ok).toBe(true)
    expect(mockCreate).toHaveBeenCalledWith({
      userId: 'user-1',
      documentType: 'resume',
      content: 'A sufficiently long resume body text.',
    })
  })

  it('skips (false, no write) for missing user, empty, or too-short text', async () => {
    expect(await saveUploadedResumeText('', 'A sufficiently long resume body text.')).toBe(false)
    expect(await saveUploadedResumeText('user-1', '   ')).toBe(false)
    expect(await saveUploadedResumeText('user-1', 'too short')).toBe(false)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns false when persistence fails, so scoring falls back unchanged', async () => {
    mockCreate.mockRejectedValueOnce(new Error('storage down'))
    await expect(
      saveUploadedResumeText('user-1', 'A sufficiently long resume body text.'),
    ).resolves.toBe(false)
  })
})
