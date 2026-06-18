import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import {
  cancelQueued,
  decideQueueAction,
  enqueueForSubmission,
  fetchQueueEntry,
  fetchSubmitThreshold,
} from './submissionQueueService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

const ROW = {
  id: 'queue-1',
  status: 'approved',
  queued_by: 'user',
  channel: null,
  attempts: 0,
  last_error: null,
  last_attempt_at: null,
  submitted_at: null,
}

/** Build a chainable `select().eq().eq().maybeSingle()` read mock. */
function selectChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eqApp = vi.fn(() => ({ maybeSingle }))
  const eqUser = vi.fn(() => ({ eq: eqApp }))
  const select = vi.fn(() => ({ eq: eqUser }))
  return { select, eqUser, eqApp, maybeSingle }
}

describe('submissionQueueService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enqueueForSubmission', () => {
    it('inserts a user-scoped approved row and returns the queue entry', async () => {
      const single = vi.fn().mockResolvedValue({ data: ROW, error: null })
      const select = vi.fn(() => ({ single }))
      const insert = vi.fn(() => ({ select }))
      const from = vi.fn(() => ({ insert }))

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await enqueueForSubmission({
        userId: 'user-1',
        applicationId: 'app-1',
        status: 'approved',
        queuedBy: 'user',
      })

      expect(from).toHaveBeenCalledWith('application_queue')
      expect(insert).toHaveBeenCalledWith({
        user_id: 'user-1',
        application_id: 'app-1',
        status: 'approved',
        queued_by: 'user',
      })
      expect(entry).toEqual({
        id: 'queue-1',
        status: 'approved',
        queuedBy: 'user',
        channel: null,
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
        submittedAt: null,
      })
    })

    it('treats a 23505 unique violation as "already queued" and re-fetches the existing row', async () => {
      const single = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
      const selectInsert = vi.fn(() => ({ single }))
      const insert = vi.fn(() => ({ select: selectInsert }))

      const existing = { ...ROW, status: 'pending_approval', queued_by: 'assist_mode' }
      const read = selectChain({ data: existing, error: null })

      const from = vi
        .fn()
        .mockImplementationOnce(() => ({ insert })) // INSERT raises 23505
        .mockImplementationOnce(() => ({ select: read.select })) // re-fetch existing

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await enqueueForSubmission({
        userId: 'user-1',
        applicationId: 'app-1',
        status: 'approved',
        queuedBy: 'user',
      })

      expect(insert).toHaveBeenCalledTimes(1)
      expect(read.eqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(read.eqApp).toHaveBeenCalledWith('application_id', 'app-1')
      expect(entry.status).toBe('pending_approval')
      expect(entry.queuedBy).toBe('assist_mode')
    })

    it('throws on a non-unique-violation insert error', async () => {
      const single = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: '42501', message: 'rls denied' } })
      const select = vi.fn(() => ({ single }))
      const insert = vi.fn(() => ({ select }))
      const from = vi.fn(() => ({ insert }))

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      await expect(
        enqueueForSubmission({
          userId: 'user-1',
          applicationId: 'app-1',
          status: 'approved',
          queuedBy: 'user',
        }),
      ).rejects.toThrow(/rls denied/)
    })
  })

  describe('fetchQueueEntry', () => {
    it('returns the user-scoped row when present', async () => {
      const read = selectChain({ data: ROW, error: null })
      const from = vi.fn(() => ({ select: read.select }))
      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await fetchQueueEntry('user-1', 'app-1')

      expect(read.eqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(read.eqApp).toHaveBeenCalledWith('application_id', 'app-1')
      expect(entry?.status).toBe('approved')
    })

    it('returns null when there is no row', async () => {
      const read = selectChain({ data: null, error: null })
      const from = vi.fn(() => ({ select: read.select }))
      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      expect(await fetchQueueEntry('user-1', 'app-1')).toBeNull()
    })

    it('throws on a read error', async () => {
      const read = selectChain({ data: null, error: { message: 'boom' } })
      const from = vi.fn(() => ({ select: read.select }))
      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      await expect(fetchQueueEntry('user-1', 'app-1')).rejects.toThrow(/boom/)
    })
  })

  describe('cancelQueued', () => {
    it('moves a pending_approval row to cancelled (user-scoped)', async () => {
      const read = selectChain({ data: { ...ROW, status: 'pending_approval' }, error: null })

      const cancelledRow = { ...ROW, status: 'cancelled' }
      const maybeSingle = vi.fn().mockResolvedValue({ data: cancelledRow, error: null })
      const selectUpdate = vi.fn(() => ({ maybeSingle }))
      const eqAppUpdate = vi.fn(() => ({ select: selectUpdate }))
      const eqUserUpdate = vi.fn(() => ({ eq: eqAppUpdate }))
      const update = vi.fn(() => ({ eq: eqUserUpdate }))

      const from = vi
        .fn()
        .mockImplementationOnce(() => ({ select: read.select })) // fetch existing
        .mockImplementationOnce(() => ({ update })) // perform cancel

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await cancelQueued({ userId: 'user-1', applicationId: 'app-1' })

      expect(update).toHaveBeenCalledWith({ status: 'cancelled' })
      expect(eqUserUpdate).toHaveBeenCalledWith('user_id', 'user-1')
      expect(eqAppUpdate).toHaveBeenCalledWith('application_id', 'app-1')
      expect(entry?.status).toBe('cancelled')
    })

    it('is a no-op when the row is already worker-owned (submitting)', async () => {
      const read = selectChain({ data: { ...ROW, status: 'submitting' }, error: null })
      const update = vi.fn()
      const from = vi
        .fn()
        .mockImplementationOnce(() => ({ select: read.select }))
        .mockImplementationOnce(() => ({ update }))

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await cancelQueued({ userId: 'user-1', applicationId: 'app-1' })

      expect(entry).toBeNull()
      expect(update).not.toHaveBeenCalled()
    })

    it('is a no-op when there is no queue row', async () => {
      const read = selectChain({ data: null, error: null })
      const update = vi.fn()
      const from = vi
        .fn()
        .mockImplementationOnce(() => ({ select: read.select }))
        .mockImplementationOnce(() => ({ update }))

      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      const entry = await cancelQueued({ userId: 'user-1', applicationId: 'app-1' })

      expect(entry).toBeNull()
      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('fetchSubmitThreshold', () => {
    it('reads auto_submit_score_threshold from user_settings', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: { auto_submit_score_threshold: 85 }, error: null })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      expect(await fetchSubmitThreshold('user-1')).toBe(85)
      expect(from).toHaveBeenCalledWith('user_settings')
      expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('falls back to the ADR-006 default when no row exists', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetSupabaseClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>)

      expect(await fetchSubmitThreshold('user-1')).toBe(80)
    })
  })
})

describe('decideQueueAction (ADR-006 / BR-130 mode-specific autonomy floors)', () => {
  // Hybrid (assist) floor; Auto floor defaults to AUTO_MODE_MIN_SCORE (60).
  const threshold = 80
  const autoThreshold = 60

  it('review mode never auto-enqueues (explicit approval always required)', () => {
    expect(decideQueueAction({ reviewMode: 'review', matchScore: 95, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
    expect(decideQueueAction({ reviewMode: 'review', matchScore: 50, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
    expect(decideQueueAction({ reviewMode: 'review', matchScore: null, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
  })

  it('assist (Hybrid) mode auto-queues approved at or above the 80 threshold via assist_mode', () => {
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 80, threshold, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'assist_mode',
    })
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 92, threshold, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'assist_mode',
    })
  })

  it('assist (Hybrid) mode below the 80 threshold waits for explicit approval (does NOT use the auto floor)', () => {
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 79, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
    // 65 clears the auto floor (60) but NOT the Hybrid threshold (80) — Hybrid queues it.
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 65, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: null, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
  })

  it('auto mode auto-queues approved at or above the 60 floor (everything in the pipeline) via auto_mode', () => {
    // 60 floor, NOT the 80 Hybrid threshold — this is the key behavioural delta.
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 60, threshold, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'auto_mode',
    })
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 79, threshold, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'auto_mode',
    })
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 100, threshold, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'auto_mode',
    })
  })

  it('auto mode below the 60 floor / null score waits for explicit approval', () => {
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 59, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: null, threshold, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
  })

  it('defaults the auto floor to AUTO_MODE_MIN_SCORE (60) when autoThreshold is omitted', () => {
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 60, threshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'auto_mode',
    })
    expect(decideQueueAction({ reviewMode: 'auto', matchScore: 59, threshold })).toEqual({
      shouldEnqueue: false,
    })
  })

  it('honors a non-default Hybrid threshold from user_settings (no literal coupling)', () => {
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 70, threshold: 65, autoThreshold })).toEqual({
      shouldEnqueue: true,
      status: 'approved',
      queuedBy: 'assist_mode',
    })
    expect(decideQueueAction({ reviewMode: 'assist', matchScore: 70, threshold: 90, autoThreshold })).toEqual({
      shouldEnqueue: false,
    })
  })
})
