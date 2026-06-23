import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClientSafe } from '@/lib/supabase'
import { ensureApplicationForJob, fetchJobMatches } from './autoApplyService'

// ADR-016 coverage: the Dashboard inbox merges prospected/corpus `jobs` (no
// application yet) into the application-derived JobMatch[] as 'Review' rows, and
// Apply/Decline lazily create the application via ensureApplicationForJob. The DB
// client is fully mocked.
vi.mock('@/lib/supabase', () => ({ getSupabaseClientSafe: vi.fn() }))

const mockGetClient = vi.mocked(getSupabaseClientSafe)

type DbResult = { data: unknown; error: unknown }

/** A fully chainable, awaitable PostgREST-builder stand-in. Every query method
 *  returns the same builder; awaiting it (or calling single/maybeSingle) yields
 *  `result`. Lets us mock the long .select().eq().order().limit()… chains. */
function thenable(result: DbResult) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
    b[m] = vi.fn(() => b)
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  b.single = vi.fn(() => Promise.resolve(result))
  b.then = (res: (v: DbResult) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return b
}

function setClient(from: ReturnType<typeof vi.fn>) {
  mockGetClient.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClientSafe>)
}

const company = { name: 'Directive', domain: 'directive.com', industry: 'Agency', size_range: '51-200' }

/** A prospected/corpus jobs row (LiveProspectJobRow shape). */
function prospectRow(id: string, source: string, score: number | null = null) {
  return {
    id,
    title: `Salesforce Architect ${id}`,
    location: 'Remote',
    description: 'Lead the Salesforce platform.',
    skills: ['salesforce'],
    compensation_min: 120000,
    compensation_max: 150000,
    source,
    source_url: `https://boards.greenhouse.io/x/${id}`,
    posted_at: null,
    created_at: '2026-06-20T00:00:00.000Z',
    companies: company,
    ai_scores: score == null ? [] : [{ overall_score: score, strengths: ['sfdc'], gaps: [], recommendation: 'apply', reasoning_trace: { source: 'llm' } }],
  }
}

describe('fetchJobMatches — ADR-016 prospect/corpus merge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns demo seeds when there is no Supabase client or user', async () => {
    mockGetClient.mockReturnValue(null as unknown as ReturnType<typeof getSupabaseClientSafe>)
    const res = await fetchJobMatches('user-1')
    expect(res.source).toBe('demo')
  })

  it('maps prospected/corpus jobs with no application into Review inbox rows (jobId + source)', async () => {
    const from = vi
      .fn()
      .mockImplementationOnce(() => thenable({ data: [], error: null })) // applications → none
      .mockImplementationOnce(() => thenable({ data: [prospectRow('job-9', 'corpus', 88)], error: null })) // jobs
    setClient(from)

    const { source, jobs } = await fetchJobMatches('user-1')

    expect(source).toBe('live')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      id: 'job:job-9',
      jobId: 'job-9',
      source: 'corpus',
      status: 'Review',
      stage: 'discovery',
      score: 88,
    })
    // No application yet — Apply/Decline will create one lazily.
    expect(jobs[0].applicationId).toBeUndefined()
  })

  it('dedups by job_id — a job already in the pipeline is shown once as its application row', async () => {
    const appRow = {
      id: 'app-1',
      stage: 'applied',
      match_score: 90,
      updated_at: '2026-06-21T00:00:00.000Z',
      application_url: null,
      jobs: { id: 'job-9', title: 'SFDC', location: null, description: null, skills: null, compensation_min: null, compensation_max: null, source_url: null, companies: company, ai_scores: [] },
    }
    const from = vi
      .fn()
      .mockImplementationOnce(() => thenable({ data: [appRow], error: null })) // applications (applied → no markers query)
      .mockImplementationOnce(() => thenable({ data: [prospectRow('job-9', 'corpus'), prospectRow('job-10', 'prospector')], error: null }))
    setClient(from)

    const { jobs } = await fetchJobMatches('user-1')

    // job-9 appears once, as the Applied application row; job-10 is the only prospect row.
    expect(jobs.map((j) => j.id)).toEqual(['app-1', 'job:job-10'])
    expect(jobs.find((j) => j.id === 'app-1')?.status).toBe('Applied')
    expect(jobs.filter((j) => j.jobId === 'job-9')).toHaveLength(0)
  })

  it('falls back to demo seeds when there are neither applications nor prospect jobs', async () => {
    const from = vi
      .fn()
      .mockImplementationOnce(() => thenable({ data: [], error: null }))
      .mockImplementationOnce(() => thenable({ data: [], error: null }))
    setClient(from)

    const res = await fetchJobMatches('user-1')
    expect(res.source).toBe('demo')
  })
})

describe('ensureApplicationForJob — ADR-016 lazy application creation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null in demo mode (no client / no user)', async () => {
    mockGetClient.mockReturnValue(null as unknown as ReturnType<typeof getSupabaseClientSafe>)
    expect(await ensureApplicationForJob('user-1', 'job-1')).toBeNull()
  })

  it('returns the existing application id when one already exists', async () => {
    const from = vi.fn().mockImplementationOnce(() => thenable({ data: { id: 'app-existing', stage: 'discovery' }, error: null }))
    setClient(from)
    expect(await ensureApplicationForJob('user-1', 'job-1')).toBe('app-existing')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('creates a discovery application when none exists', async () => {
    const from = vi
      .fn()
      .mockImplementationOnce(() => thenable({ data: null, error: null })) // maybeSingle → none
      .mockImplementationOnce(() => thenable({ data: { id: 'app-new', stage: 'discovery' }, error: null })) // insert→select→single
    setClient(from)
    expect(await ensureApplicationForJob('user-1', 'job-1')).toBe('app-new')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('absorbs a concurrent-create 23505 by re-fetching the existing application', async () => {
    const from = vi
      .fn()
      .mockImplementationOnce(() => thenable({ data: null, error: null })) // maybeSingle → none
      .mockImplementationOnce(() => thenable({ data: null, error: { code: '23505', message: 'duplicate key' } })) // insert conflict
      .mockImplementationOnce(() => thenable({ data: { id: 'app-raced', stage: 'discovery' }, error: null })) // re-fetch
    setClient(from)
    expect(await ensureApplicationForJob('user-1', 'job-1')).toBe('app-raced')
    expect(from).toHaveBeenCalledTimes(3)
  })
})
