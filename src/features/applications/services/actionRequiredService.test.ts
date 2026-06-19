import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { fetchActionRequiredCount } from './actionRequiredService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

// Records the filters applied to a head-only count query and resolves to the
// count supplied by the caller (computed lazily so resolution can depend on the
// filters recorded after `from()` returns — e.g. discovery vs offer stage).
type Filters = { eq: Record<string, unknown>; in: Record<string, unknown>; is: Record<string, unknown> }

function makeQuery(countFor: (f: Filters) => number) {
  const filters: Filters = { eq: {}, in: {}, is: {} }
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.eq[column] = value
      return query
    }),
    in: vi.fn((column: string, value: unknown) => {
      filters.in[column] = value
      return query
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.is[column] = value
      return query
    }),
    then: (resolve: (result: { count: number; error: null }) => unknown) =>
      resolve({ count: countFor(filters), error: null }),
  }
  return query
}

describe('actionRequiredService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sums the per-bucket counts across the funnel and scopes every query to the user', () => {
    const from = vi.fn((table: string) => {
      if (table === 'applications') {
        return makeQuery((f) => (f.eq.stage === 'discovery' ? 3 : f.eq.stage === 'offer' ? 1 : 0))
      }
      if (table === 'interviews') return makeQuery(() => 2)
      if (table === 'emails') return makeQuery(() => 4)
      return makeQuery(() => 0)
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    return fetchActionRequiredCount('user-1').then((result) => {
      expect(result).toEqual({
        unreviewedMatches: 3,
        interviews: 2,
        offers: 1,
        inbox: 4,
        total: 10,
      })
      // Every table query is scoped to the requested user (BR-005 / user scoping).
      for (const call of from.mock.results) {
        const query = call.value as ReturnType<typeof makeQuery>
        expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
      }
    })
  })

  it('treats a null count as zero per bucket', () => {
    const from = vi.fn(() => makeQuery(() => null as unknown as number))

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    return fetchActionRequiredCount('user-1').then((result) => {
      expect(result).toEqual({
        unreviewedMatches: 0,
        interviews: 0,
        offers: 0,
        inbox: 0,
        total: 0,
      })
    })
  })

  it('falls back to zeros when a query rejects, so the nav badge degrades gracefully', () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.reject(new Error('connection refused'))),
          in: vi.fn(() => Promise.reject(new Error('connection refused'))),
          is: vi.fn(() => ({ in: vi.fn(() => Promise.reject(new Error('connection refused'))) })),
        })),
      })),
    }))

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    return fetchActionRequiredCount('user-1').then((result) => {
      expect(result).toEqual({
        unreviewedMatches: 0,
        interviews: 0,
        offers: 0,
        inbox: 0,
        total: 0,
      })
    })
  })
})
