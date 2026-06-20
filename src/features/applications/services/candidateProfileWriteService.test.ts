import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClientSafe } from '@/lib/supabase'
import {
  deleteApplicationAnswer,
  fetchApplicationAnswers,
  fetchCandidateProfile,
  upsertApplicationAnswer,
  upsertCandidateProfile,
} from './candidateProfileWriteService'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClientSafe: vi.fn(),
}))

const mockGetClient = vi.mocked(getSupabaseClientSafe)

type Client = ReturnType<typeof getSupabaseClientSafe>

describe('candidateProfileWriteService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when Supabase is unconfigured', () => {
    beforeEach(() => {
      mockGetClient.mockReturnValue(null)
    })

    it('fetchCandidateProfile resolves to null and never touches the DB', async () => {
      await expect(fetchCandidateProfile('user-1')).resolves.toBeNull()
    })

    it('fetchApplicationAnswers resolves to an empty list', async () => {
      await expect(fetchApplicationAnswers('user-1')).resolves.toEqual([])
    })

    it('upsertCandidateProfile no-ops without throwing', async () => {
      await expect(upsertCandidateProfile('user-1', { full_name: 'X' })).resolves.toBeUndefined()
    })

    it('upsertApplicationAnswer no-ops without throwing', async () => {
      await expect(
        upsertApplicationAnswer('user-1', { question_key: 'k', question_label: 'L', answer: 'A', answer_type: 'text' }),
      ).resolves.toBeUndefined()
    })
  })

  describe('fetchCandidateProfile', () => {
    it('scopes the select by user_id and returns the row', async () => {
      const profileRow = { id: 'p1', user_id: 'user-1', full_name: 'Jordan Ellery' }
      const maybeSingle = vi.fn().mockResolvedValue({ data: profileRow, error: null })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      const result = await fetchCandidateProfile('user-1')

      expect(from).toHaveBeenCalledWith('candidate_profiles')
      expect(select).toHaveBeenCalledWith('*')
      expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(result).toBe(profileRow)
    })

    it('throws when the query errors', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchCandidateProfile('user-1')).rejects.toThrow('boom')
    })
  })

  describe('upsertCandidateProfile', () => {
    it('forces user_id onto the patch and upserts on the user_id conflict target', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null })
      const from = vi.fn(() => ({ upsert }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await upsertCandidateProfile('user-1', { full_name: 'Jordan Ellery', requires_sponsorship: false })

      expect(from).toHaveBeenCalledWith('candidate_profiles')
      expect(upsert).toHaveBeenCalledWith(
        { full_name: 'Jordan Ellery', requires_sponsorship: false, user_id: 'user-1' },
        { onConflict: 'user_id' },
      )
    })

    it('overrides any caller-supplied user_id with the trusted argument', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null })
      const from = vi.fn(() => ({ upsert }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      // A patch that tries to target another user must be neutralized.
      await upsertCandidateProfile('user-1', { user_id: 'attacker', full_name: 'Mallory' })

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', full_name: 'Mallory' }),
        { onConflict: 'user_id' },
      )
    })

    it('throws when the upsert errors', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: { message: 'denied' } })
      const from = vi.fn(() => ({ upsert }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(upsertCandidateProfile('user-1', { full_name: 'X' })).rejects.toThrow('denied')
    })
  })

  describe('fetchApplicationAnswers', () => {
    it('scopes by user_id, orders oldest first, and returns the rows', async () => {
      const rows = [{ id: 'a1', user_id: 'user-1', question_key: 'notice', question_label: 'Notice?', answer: '2 weeks', answer_type: 'text' }]
      const order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const eq = vi.fn(() => ({ order }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      const result = await fetchApplicationAnswers('user-1')

      expect(from).toHaveBeenCalledWith('application_answers')
      expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(order).toHaveBeenCalledWith('created_at', { ascending: true })
      expect(result).toEqual(rows)
    })

    it('returns an empty array when data is null', async () => {
      const order = vi.fn().mockResolvedValue({ data: null, error: null })
      const eq = vi.fn(() => ({ order }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchApplicationAnswers('user-1')).resolves.toEqual([])
    })
  })

  describe('upsertApplicationAnswer', () => {
    it('upserts on the composite (user_id, question_key) conflict target', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: null })
      const from = vi.fn(() => ({ upsert }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await upsertApplicationAnswer('user-1', {
        question_key: 'why-here',
        question_label: 'Why here?',
        answer: 'Mission fit',
        answer_type: 'text',
      })

      expect(from).toHaveBeenCalledWith('application_answers')
      expect(upsert).toHaveBeenCalledWith(
        {
          question_key: 'why-here',
          question_label: 'Why here?',
          answer: 'Mission fit',
          answer_type: 'text',
          user_id: 'user-1',
        },
        { onConflict: 'user_id,question_key' },
      )
    })

    it('throws when the upsert errors', async () => {
      const upsert = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
      const from = vi.fn(() => ({ upsert }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(
        upsertApplicationAnswer('user-1', { question_key: 'k', question_label: 'L', answer: 'A', answer_type: 'text' }),
      ).rejects.toThrow('nope')
    })
  })

  describe('deleteApplicationAnswer', () => {
    it('deletes scoped by both user_id and question_key', async () => {
      const eqKey = vi.fn().mockResolvedValue({ error: null })
      const eqUser = vi.fn(() => ({ eq: eqKey }))
      const del = vi.fn(() => ({ eq: eqUser }))
      const from = vi.fn(() => ({ delete: del }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await deleteApplicationAnswer('user-1', 'why-here')

      expect(from).toHaveBeenCalledWith('application_answers')
      expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(eqKey).toHaveBeenCalledWith('question_key', 'why-here')
    })

    it('throws when the delete errors', async () => {
      const eqKey = vi.fn().mockResolvedValue({ error: { message: 'fail' } })
      const eqUser = vi.fn(() => ({ eq: eqKey }))
      const del = vi.fn(() => ({ eq: eqUser }))
      const from = vi.fn(() => ({ delete: del }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(deleteApplicationAnswer('user-1', 'k')).rejects.toThrow('fail')
    })
  })
})
