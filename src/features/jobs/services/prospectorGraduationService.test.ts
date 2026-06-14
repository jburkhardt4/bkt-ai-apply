import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClientSafe } from '@/lib/supabase'
import {
  decideQueueAction,
  enqueueForSubmission,
  fetchSubmitThreshold,
} from '@/features/applications/services/submissionQueueService'
import { graduateProspectorMatches } from './prospectorGraduationService'

// The DB client is fully mocked; submissionQueueService is mocked too so these
// tests isolate the graduation ORCHESTRATION (latest-score-per-job selection,
// threshold gating, idempotent create + 23505 absorption, existing-app score
// sync, mode-based enqueue). decideQueueAction's own autonomy semantics are
// already covered in submissionQueueService.test.ts.
vi.mock('@/lib/supabase', () => ({ getSupabaseClientSafe: vi.fn() }))
vi.mock('@/features/applications/services/submissionQueueService', () => ({
  decideQueueAction: vi.fn(),
  enqueueForSubmission: vi.fn(),
  fetchSubmitThreshold: vi.fn(),
}))

const mockGetSupabaseClientSafe = vi.mocked(getSupabaseClientSafe)
const mockDecide = vi.mocked(decideQueueAction)
const mockEnqueue = vi.mocked(enqueueForSubmission)
const mockThreshold = vi.mocked(fetchSubmitThreshold)

type DbResult = { data: unknown; error: unknown }
const T = (day: number) => `2026-06-0${day}T00:00:00.000Z`

// ── Chainable builders mirroring the exact terminal point of each query ──────

/** ai_scores: .select().eq().eq().order() → awaited directly. */
function aiScores(result: DbResult) {
  const order = vi.fn().mockResolvedValue(result)
  const eq2 = vi.fn(() => ({ order }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { select }
}

/** applications scan: .select().eq().in() → awaited directly. */
function appsScan(result: DbResult) {
  const inFn = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ in: inFn }))
  const select = vi.fn(() => ({ eq }))
  return { select, in: inFn }
}

/** applications insert: .insert().select().single(). */
function appsInsert(result: DbResult) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  return { insert }
}

/** applications update: .update().eq().eq() → awaited directly. */
function appsUpdate(result: DbResult = { data: null, error: null }) {
  const eq2 = vi.fn().mockResolvedValue(result)
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const update = vi.fn(() => ({ eq: eq1 }))
  return { update, eqUser: eq1, eqId: eq2 }
}

/** applications 23505 re-fetch: .select().eq().eq().maybeSingle(). */
function appsRefetch(result: DbResult) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq2 = vi.fn(() => ({ maybeSingle }))
  const eq1 = vi.fn(() => ({ eq: eq2 }))
  const select = vi.fn(() => ({ eq: eq1 }))
  return { select, maybeSingle }
}

function setClient(from: ReturnType<typeof vi.fn>) {
  mockGetSupabaseClientSafe.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClientSafe>)
}

describe('graduateProspectorMatches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockThreshold.mockResolvedValue(80)
    mockDecide.mockReturnValue({ shouldEnqueue: false })
    mockEnqueue.mockResolvedValue(undefined as never)
  })

  it('returns zero counts and does no further work when no score meets the threshold', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 40, scored_at: T(3) }], error: null })
    const from = vi.fn().mockImplementationOnce(() => ({ select: scores.select }))
    setClient(from)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'auto' })

    expect(result).toEqual({ created: 0, enqueued: 0 })
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('ai_scores')
    expect(mockThreshold).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('uses the latest score per job — a job rescored below threshold is not graduated', async () => {
    // Rows in scored_at DESC order: job-2 latest is 45 (was 85), job-1 latest is 82.
    const scores = aiScores({
      data: [
        { job_id: 'job-2', overall_score: 45, scored_at: T(5) }, // newest for job-2
        { job_id: 'job-1', overall_score: 82, scored_at: T(4) },
        { job_id: 'job-2', overall_score: 85, scored_at: T(1) }, // stale high score
      ],
      error: null,
    })
    const scan = appsScan({ data: [], error: null })
    const ins = appsInsert({ data: { id: 'app-1' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins.insert }))
    setClient(from)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' })

    // Only job-1 graduates; job-2 (latest 45) is excluded despite its stale 85.
    expect(result.created).toBe(1)
    expect(scan.in).toHaveBeenCalledWith('job_id', ['job-1'])
  })

  it('creates discovery applications carrying the score for qualifying jobs without one', async () => {
    const scores = aiScores({
      data: [
        { job_id: 'job-1', overall_score: 82, scored_at: T(3) },
        { job_id: 'job-2', overall_score: 91, scored_at: T(2) },
      ],
      error: null,
    })
    const scan = appsScan({ data: [], error: null })
    const ins1 = appsInsert({ data: { id: 'app-1' }, error: null })
    const ins2 = appsInsert({ data: { id: 'app-2' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins1.insert }))
      .mockImplementationOnce(() => ({ insert: ins2.insert }))
    setClient(from)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' })

    expect(result.created).toBe(2)
    expect(result.enqueued).toBe(0)
    expect(ins1.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      job_id: 'job-1',
      stage: 'discovery',
      match_score: 82,
    })
    expect(ins2.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      job_id: 'job-2',
      stage: 'discovery',
      match_score: 91,
    })
  })

  it('updates match_score on an existing application instead of creating a duplicate', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 82, scored_at: T(3) }], error: null })
    const scan = appsScan({ data: [{ id: 'app-1', job_id: 'job-1' }], error: null })
    const upd = appsUpdate()
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ update: upd.update }))
    setClient(from)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' })

    expect(result.created).toBe(0)
    expect(upd.update).toHaveBeenCalledWith({ match_score: 82 })
    expect(upd.eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(upd.eqId).toHaveBeenCalledWith('id', 'app-1')
  })

  it('absorbs a concurrent-create 23505 conflict by re-fetching the existing application', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 82, scored_at: T(3) }], error: null })
    const scan = appsScan({ data: [], error: null })
    const ins = appsInsert({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const refetch = appsRefetch({ data: { id: 'app-existing' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins.insert }))
      .mockImplementationOnce(() => ({ select: refetch.select }))
    setClient(from)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' })

    expect(result.created).toBe(0)
    expect(refetch.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('throws when an application insert fails for a non-conflict reason', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 82, scored_at: T(3) }], error: null })
    const scan = appsScan({ data: [], error: null })
    const ins = appsInsert({ data: null, error: { code: '42501', message: 'rls denied' } })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins.insert }))
    setClient(from)

    await expect(
      graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' }),
    ).rejects.toThrow(/rls denied/)
  })

  it('throws when the score scan fails', async () => {
    const scores = aiScores({ data: null, error: { message: 'boom' } })
    const from = vi.fn().mockImplementationOnce(() => ({ select: scores.select }))
    setClient(from)

    await expect(
      graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' }),
    ).rejects.toThrow(/boom/)
  })

  it('enqueues qualifying matches in auto mode using the decideQueueAction verdict', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 92, scored_at: T(3) }], error: null })
    const scan = appsScan({ data: [], error: null })
    const ins = appsInsert({ data: { id: 'app-1' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins.insert }))
    setClient(from)
    mockDecide.mockReturnValue({ shouldEnqueue: true, status: 'approved', queuedBy: 'auto_mode' })

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'auto' })

    expect(result.enqueued).toBe(1)
    expect(mockDecide).toHaveBeenCalledWith({ reviewMode: 'auto', matchScore: 92, threshold: 80 })
    expect(mockEnqueue).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      status: 'approved',
      queuedBy: 'auto_mode',
    })
  })

  it('enqueues nothing in review mode even when scores qualify', async () => {
    const scores = aiScores({ data: [{ job_id: 'job-1', overall_score: 95, scored_at: T(3) }], error: null })
    const scan = appsScan({ data: [], error: null })
    const ins = appsInsert({ data: { id: 'app-1' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins.insert }))
    setClient(from)
    mockDecide.mockReturnValue({ shouldEnqueue: false })

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'review' })

    expect(result.enqueued).toBe(0)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('continues enqueuing after a single enqueue failure (best-effort)', async () => {
    const scores = aiScores({
      data: [
        { job_id: 'job-1', overall_score: 92, scored_at: T(3) },
        { job_id: 'job-2', overall_score: 90, scored_at: T(2) },
      ],
      error: null,
    })
    const scan = appsScan({ data: [], error: null })
    const ins1 = appsInsert({ data: { id: 'app-1' }, error: null })
    const ins2 = appsInsert({ data: { id: 'app-2' }, error: null })
    const from = vi
      .fn()
      .mockImplementationOnce(() => ({ select: scores.select }))
      .mockImplementationOnce(() => ({ select: scan.select }))
      .mockImplementationOnce(() => ({ insert: ins1.insert }))
      .mockImplementationOnce(() => ({ insert: ins2.insert }))
    setClient(from)
    mockDecide.mockReturnValue({ shouldEnqueue: true, status: 'approved', queuedBy: 'auto_mode' })
    mockEnqueue.mockRejectedValueOnce(new Error('enqueue failed')).mockResolvedValueOnce(undefined as never)

    const result = await graduateProspectorMatches({ userId: 'user-1', reviewMode: 'auto' })

    expect(result.created).toBe(2)
    expect(result.enqueued).toBe(1)
    expect(mockEnqueue).toHaveBeenCalledTimes(2)
  })
})
