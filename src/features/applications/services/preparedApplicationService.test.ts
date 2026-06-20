import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClientSafe } from '@/lib/supabase'
import {
  PrepareApplicationError,
  fetchPreparedApplicationWithFields,
  fetchPreparedApplications,
  triggerPrepare,
  updatePreparedStatus,
} from './preparedApplicationService'

vi.mock('@/lib/supabase', () => ({
  getSupabaseClientSafe: vi.fn(),
}))

// readEdgeFunctionError reads the real cause off the Edge error body; stub it so
// the invoke error path is deterministic without a real Response.
vi.mock('@/lib/edgeFunctionError', () => ({
  readEdgeFunctionError: vi.fn(async (_error: unknown, fallback: string) => fallback),
}))

const mockGetClient = vi.mocked(getSupabaseClientSafe)

type Client = ReturnType<typeof getSupabaseClientSafe>

describe('preparedApplicationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when Supabase is unconfigured', () => {
    beforeEach(() => {
      mockGetClient.mockReturnValue(null)
    })

    it('fetchPreparedApplications resolves to an empty list and never touches the DB', async () => {
      await expect(fetchPreparedApplications('user-1')).resolves.toEqual([])
    })

    it('fetchPreparedApplicationWithFields resolves to null', async () => {
      await expect(fetchPreparedApplicationWithFields('user-1', 'prep-1')).resolves.toBeNull()
    })

    it('updatePreparedStatus no-ops without throwing', async () => {
      await expect(updatePreparedStatus('user-1', 'prep-1', 'stale')).resolves.toBeUndefined()
    })

    it('triggerPrepare throws a PrepareApplicationError (no backend to call)', async () => {
      await expect(
        triggerPrepare({ job: { url: 'https://boards.greenhouse.io/acme/jobs/1' } }),
      ).rejects.toBeInstanceOf(PrepareApplicationError)
    })
  })

  describe('fetchPreparedApplications', () => {
    it('scopes by user_id, orders newest first, and returns the rows', async () => {
      const rows = [
        { id: 'p1', user_id: 'user-1', status: 'prepared' },
        { id: 'p2', user_id: 'user-1', status: 'needs_review' },
      ]
      const order = vi.fn().mockResolvedValue({ data: rows, error: null })
      const eq = vi.fn(() => ({ order }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      const result = await fetchPreparedApplications('user-1')

      expect(from).toHaveBeenCalledWith('prepared_applications')
      expect(select).toHaveBeenCalledWith('*')
      expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toEqual(rows)
    })

    it('returns an empty array when data is null', async () => {
      const order = vi.fn().mockResolvedValue({ data: null, error: null })
      const eq = vi.fn(() => ({ order }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchPreparedApplications('user-1')).resolves.toEqual([])
    })

    it('throws when the query errors', async () => {
      const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
      const eq = vi.fn(() => ({ order }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchPreparedApplications('user-1')).rejects.toThrow('boom')
    })
  })

  describe('fetchPreparedApplicationWithFields', () => {
    it('scopes both queries by user_id, gates review fields first, and returns app + fields', async () => {
      const app = { id: 'prep-1', user_id: 'user-1', status: 'needs_review' }
      const fields = [
        { id: 'f1', prepared_application_id: 'prep-1', user_id: 'user-1', field_key: 'work_auth', review_gate: true },
        { id: 'f2', prepared_application_id: 'prep-1', user_id: 'user-1', field_key: 'first_name', review_gate: false },
      ]

      // First .from() call → prepared_applications.maybeSingle()
      const maybeSingle = vi.fn().mockResolvedValue({ data: app, error: null })
      const appEqId = vi.fn(() => ({ maybeSingle }))
      const appEqUser = vi.fn(() => ({ eq: appEqId }))
      const appSelect = vi.fn(() => ({ eq: appEqUser }))

      // Second .from() call → prepared_application_fields with two .order() calls
      const orderByKey = vi.fn().mockResolvedValue({ data: fields, error: null })
      const orderByGate = vi.fn(() => ({ order: orderByKey }))
      const fieldEqPrep = vi.fn(() => ({ order: orderByGate }))
      const fieldEqUser = vi.fn(() => ({ eq: fieldEqPrep }))
      const fieldSelect = vi.fn(() => ({ eq: fieldEqUser }))

      const from = vi
        .fn()
        .mockReturnValueOnce({ select: appSelect })
        .mockReturnValueOnce({ select: fieldSelect })
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      const result = await fetchPreparedApplicationWithFields('user-1', 'prep-1')

      expect(from).toHaveBeenNthCalledWith(1, 'prepared_applications')
      expect(appEqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(appEqId).toHaveBeenCalledWith('id', 'prep-1')

      expect(from).toHaveBeenNthCalledWith(2, 'prepared_application_fields')
      expect(fieldEqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(fieldEqPrep).toHaveBeenCalledWith('prepared_application_id', 'prep-1')
      expect(orderByGate).toHaveBeenCalledWith('review_gate', { ascending: false })
      expect(orderByKey).toHaveBeenCalledWith('field_key', { ascending: true })

      expect(result).toEqual({ app, fields })
    })

    it('returns null and never queries fields when the app row is missing', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const appEqId = vi.fn(() => ({ maybeSingle }))
      const appEqUser = vi.fn(() => ({ eq: appEqId }))
      const appSelect = vi.fn(() => ({ eq: appEqUser }))
      const from = vi.fn(() => ({ select: appSelect }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      const result = await fetchPreparedApplicationWithFields('user-1', 'missing')

      expect(result).toBeNull()
      // Only the prepared_applications query ran; no fields query.
      expect(from).toHaveBeenCalledTimes(1)
    })

    it('throws when the app query errors', async () => {
      const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
      const appEqId = vi.fn(() => ({ maybeSingle }))
      const appEqUser = vi.fn(() => ({ eq: appEqId }))
      const appSelect = vi.fn(() => ({ eq: appEqUser }))
      const from = vi.fn(() => ({ select: appSelect }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchPreparedApplicationWithFields('user-1', 'prep-1')).rejects.toThrow('denied')
    })

    it('throws when the fields query errors', async () => {
      const app = { id: 'prep-1', user_id: 'user-1', status: 'prepared' }
      const maybeSingle = vi.fn().mockResolvedValue({ data: app, error: null })
      const appEqId = vi.fn(() => ({ maybeSingle }))
      const appEqUser = vi.fn(() => ({ eq: appEqId }))
      const appSelect = vi.fn(() => ({ eq: appEqUser }))

      const orderByKey = vi.fn().mockResolvedValue({ data: null, error: { message: 'fields-fail' } })
      const orderByGate = vi.fn(() => ({ order: orderByKey }))
      const fieldEqPrep = vi.fn(() => ({ order: orderByGate }))
      const fieldEqUser = vi.fn(() => ({ eq: fieldEqPrep }))
      const fieldSelect = vi.fn(() => ({ eq: fieldEqUser }))

      const from = vi
        .fn()
        .mockReturnValueOnce({ select: appSelect })
        .mockReturnValueOnce({ select: fieldSelect })
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(fetchPreparedApplicationWithFields('user-1', 'prep-1')).rejects.toThrow('fields-fail')
    })
  })

  describe('triggerPrepare', () => {
    it('invokes prepare-application with on_demand prep + the job descriptor and NEVER sends user_id', async () => {
      const fnResult = {
        prepared_application_id: 'prep-9',
        status: 'needs_review',
        gating_reason: 'sensitive_fields_present',
        fields: [
          { field_key: 'email', field_type: 'text', value_source: 'profile', confidence: 1, is_sensitive: false, review_gate: false },
        ],
      }
      const invoke = vi.fn().mockResolvedValue({ data: fnResult, error: null })
      mockGetClient.mockReturnValue({ functions: { invoke } } as unknown as Client)

      const result = await triggerPrepare({
        job: { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Staff Engineer', externalJobId: '1' },
        jobId: 'job-1',
        mode: 'hybrid',
        matchScore: 82,
      })

      // The body matches the Edge Function's read contract verbatim: a `job`
      // descriptor (the function detects the ATS from job.url) + hints.
      expect(invoke).toHaveBeenCalledWith('prepare-application', {
        body: {
          prepared_by: 'on_demand',
          mode: 'hybrid',
          match_score: 82,
          job: {
            url: 'https://boards.greenhouse.io/acme/jobs/1',
            title: 'Staff Engineer',
            external_job_id: '1',
            job_id: 'job-1',
          },
        },
      })
      // user_id must never be in the body — the server trusts the JWT (BR-005).
      const body = invoke.mock.calls[0][1].body as Record<string, unknown>
      expect(body).not.toHaveProperty('user_id')
      expect(result).toEqual(fnResult)
    })

    it('omits job_id, mode, and match_score from the payload when not supplied', async () => {
      const invoke = vi.fn().mockResolvedValue({
        data: { prepared_application_id: 'p1', status: 'prepared', gating_reason: null, fields: [] },
        error: null,
      })
      mockGetClient.mockReturnValue({ functions: { invoke } } as unknown as Client)

      await triggerPrepare({ job: { url: 'https://jobs.ashbyhq.com/acme/x' } })

      const body = invoke.mock.calls[0][1].body as Record<string, unknown>
      expect(body.prepared_by).toBe('on_demand')
      expect(body).not.toHaveProperty('mode')
      expect(body).not.toHaveProperty('match_score')
      // No jobId → no job_id key inside the job descriptor (never a wrong FK).
      expect(body.job).toEqual({ url: 'https://jobs.ashbyhq.com/acme/x' })
    })

    it('throws PrepareApplicationError with the resolved message when the Edge Function errors', async () => {
      const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'non-2xx' } })
      mockGetClient.mockReturnValue({ functions: { invoke } } as unknown as Client)

      await expect(
        triggerPrepare({ job: { url: 'https://boards.greenhouse.io/acme/jobs/1' } }),
      ).rejects.toBeInstanceOf(PrepareApplicationError)
    })

    it('throws PrepareApplicationError when the response body is empty', async () => {
      const invoke = vi.fn().mockResolvedValue({ data: null, error: null })
      mockGetClient.mockReturnValue({ functions: { invoke } } as unknown as Client)

      await expect(
        triggerPrepare({ job: { url: 'https://boards.greenhouse.io/acme/jobs/1' } }),
      ).rejects.toThrow('empty response')
    })

    it('throws when the response is missing prepared_application_id', async () => {
      const invoke = vi.fn().mockResolvedValue({ data: { status: 'prepared', fields: [] }, error: null })
      mockGetClient.mockReturnValue({ functions: { invoke } } as unknown as Client)

      await expect(
        triggerPrepare({ job: { url: 'https://boards.greenhouse.io/acme/jobs/1' } }),
      ).rejects.toThrow('empty response')
    })
  })

  describe('updatePreparedStatus', () => {
    it('updates the status scoped by both user_id and id', async () => {
      const eqId = vi.fn().mockResolvedValue({ error: null })
      const eqUser = vi.fn(() => ({ eq: eqId }))
      const update = vi.fn(() => ({ eq: eqUser }))
      const from = vi.fn(() => ({ update }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await updatePreparedStatus('user-1', 'prep-1', 'ready_to_fill')

      expect(from).toHaveBeenCalledWith('prepared_applications')
      expect(update).toHaveBeenCalledWith({ status: 'ready_to_fill' })
      expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
      expect(eqId).toHaveBeenCalledWith('id', 'prep-1')
    })

    it('throws when the update errors', async () => {
      const eqId = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
      const eqUser = vi.fn(() => ({ eq: eqId }))
      const update = vi.fn(() => ({ eq: eqUser }))
      const from = vi.fn(() => ({ update }))
      mockGetClient.mockReturnValue({ from } as unknown as Client)

      await expect(updatePreparedStatus('user-1', 'prep-1', 'stale')).rejects.toThrow('nope')
    })
  })
})
