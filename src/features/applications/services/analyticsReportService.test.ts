import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { buildAnalyticsReport, getAnalyticsReport } from './analyticsReportService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)

describe('analyticsReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds conversion, interview, and score-outcome metrics from grouped rows', () => {
    const report = buildAnalyticsReport({
      applications: [
        {
          id: 'app-1',
          job_id: 'job-1',
          created_at: '2026-06-01T10:00:00.000Z',
          stage: 'interview_scheduled',
          match_score: 84,
        },
        {
          id: 'app-2',
          job_id: 'job-2',
          created_at: '2026-06-02T10:00:00.000Z',
          stage: 'rejected',
          match_score: 61,
        },
        {
          id: 'app-3',
          job_id: 'job-1',
          created_at: '2026-06-03T10:00:00.000Z',
          stage: 'discovery',
          match_score: null,
        },
        {
          id: 'app-4',
          job_id: 'job-3',
          created_at: '2026-05-20T10:00:00.000Z',
          stage: 'offer',
          match_score: 90,
        },
      ],
      jobsById: new Map([
        ['job-1', { id: 'job-1', source: 'LinkedIn', company_id: 'co-1' }],
        ['job-2', { id: 'job-2', source: 'Indeed', company_id: 'co-2' }],
        ['job-3', { id: 'job-3', source: null, company_id: null }],
      ]),
      companiesById: new Map([
        ['co-1', { id: 'co-1', industry: 'SaaS' }],
        ['co-2', { id: 'co-2', industry: 'FinTech' }],
      ]),
    })

    expect(report.conversionBySource).toEqual([
      {
        source: 'Indeed',
        totalApplications: 1,
        convertedApplications: 1,
        conversionRate: 100,
      },
      {
        source: 'Unknown source',
        totalApplications: 1,
        convertedApplications: 1,
        conversionRate: 100,
      },
      {
        source: 'LinkedIn',
        totalApplications: 2,
        convertedApplications: 1,
        conversionRate: 50,
      },
    ])

    expect(report.interviewRateByIndustry).toEqual([
      {
        industry: 'Unknown industry',
        totalApplications: 1,
        interviewReachedApplications: 1,
        interviewRate: 100,
      },
      {
        industry: 'SaaS',
        totalApplications: 2,
        interviewReachedApplications: 1,
        interviewRate: 50,
      },
      {
        industry: 'FinTech',
        totalApplications: 1,
        interviewReachedApplications: 0,
        interviewRate: 0,
      },
    ])

    expect(report.scoreOutcomeDistribution).toEqual([
      {
        outcome: 'in_progress',
        applicationCount: 2,
        averageScore: 84,
        highScoreShare: 50,
      },
      {
        outcome: 'offer',
        applicationCount: 1,
        averageScore: 90,
        highScoreShare: 100,
      },
      {
        outcome: 'rejected',
        applicationCount: 1,
        averageScore: 61,
        highScoreShare: 0,
      },
    ])

    expect(report.scoreOutcomeTrend).toEqual([
      {
        month: '2026-05',
        applicationCount: 1,
        averageScore: 90,
        successRate: 100,
        rejectionRate: 0,
      },
      {
        month: '2026-06',
        applicationCount: 3,
        averageScore: 72.5,
        successRate: 0,
        rejectionRate: 33.3,
      },
    ])
  })

  it('loads user-scoped rows through supabase and composes report', async () => {
    const applicationsEq = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'app-1',
          job_id: 'job-1',
          created_at: '2026-06-01T10:00:00.000Z',
          stage: 'applied',
          match_score: 77,
        },
      ],
      error: null,
    })
    const applicationsSelect = vi.fn(() => ({ eq: applicationsEq }))

    const jobsEq = vi.fn().mockResolvedValue({
      data: [{ id: 'job-1', source: 'LinkedIn', company_id: 'co-1' }],
      error: null,
    })
    const jobsSelect = vi.fn(() => ({ eq: jobsEq }))

    const companiesIn = vi.fn().mockResolvedValue({
      data: [{ id: 'co-1', industry: 'SaaS' }],
      error: null,
    })
    const companiesSelect = vi.fn(() => ({ in: companiesIn }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') {
        return { select: applicationsSelect }
      }

      if (table === 'jobs') {
        return { select: jobsSelect }
      }

      if (table === 'companies') {
        return { select: companiesSelect }
      }

      return { select: vi.fn() }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    const report = await getAnalyticsReport('user-1')

    expect(applicationsEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(jobsEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(companiesIn).toHaveBeenCalledWith('id', ['co-1'])
    expect(report.conversionBySource[0]?.source).toBe('LinkedIn')
    expect(report.interviewRateByIndustry[0]?.industry).toBe('SaaS')
  })
})