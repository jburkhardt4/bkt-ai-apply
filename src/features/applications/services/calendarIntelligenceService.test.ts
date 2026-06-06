import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '../../../lib/supabase'
import { transitionStage } from './applicationService'
import {
  findBestCalendarApplicationMatch,
  processCalendarSignal,
} from './calendarIntelligenceService'

vi.mock('../../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('./applicationService', () => ({
  transitionStage: vi.fn(),
}))

const mockGetSupabaseClient = vi.mocked(getSupabaseClient)
const mockTransitionStage = vi.mocked(transitionStage)

describe('calendarIntelligenceService heuristics', () => {
  it('matches candidate with company name + domain heuristic signals', () => {
    const result = findBestCalendarApplicationMatch({
      signal: {
        userId: 'user-1',
        calendarEventId: 'evt-1',
        title: 'Acme interview with hiring manager',
        organizerEmail: 'recruiter@acme.com',
        attendeeEmails: ['john@bktadvisory.com'],
        scheduledAtIso: '2026-06-07T09:00:00.000Z',
      },
      candidates: [
        {
          applicationId: 'app-1',
          currentStage: 'screening',
          jobTitle: 'Senior RevOps Consultant',
          companyName: 'Acme',
          companyDomain: 'acme.com',
          recruiterEmails: ['recruiter@acme.com'],
        },
        {
          applicationId: 'app-2',
          currentStage: 'screening',
          jobTitle: 'Solutions Architect',
          companyName: 'OtherCo',
          companyDomain: 'other.co',
          recruiterEmails: ['talent@other.co'],
        },
      ],
    })

    expect(result.candidate?.applicationId).toBe('app-1')
    expect(result.score).toBeGreaterThanOrEqual(5)
  })

  it('returns non-match for noisy events without interview semantics', () => {
    const result = findBestCalendarApplicationMatch({
      signal: {
        userId: 'user-1',
        calendarEventId: 'evt-2',
        title: 'Dentist appointment',
        organizerEmail: 'appointments@clinic.com',
        attendeeEmails: ['john@bktadvisory.com'],
        scheduledAtIso: '2026-06-07T09:00:00.000Z',
      },
      candidates: [
        {
          applicationId: 'app-1',
          currentStage: 'screening',
          jobTitle: 'Senior RevOps Consultant',
          companyName: 'Acme',
          companyDomain: 'acme.com',
          recruiterEmails: ['recruiter@acme.com'],
        },
      ],
    })

    expect(result.candidate).toBeNull()
    expect(result.reason.toLowerCase()).toContain('does not look interview-related')
  })
})

describe('calendarIntelligenceService pipeline side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists interview, transitions stage, and creates notification for matched event', async () => {
    const applicationRows = [
      {
        id: 'app-10',
        stage: 'screening',
        jobs: {
          title: 'Senior RevOps Consultant',
          company_id: 'company-1',
          companies: {
            name: 'Acme',
            domain: 'acme.com',
          },
        },
      },
    ]

    const recruiterRows = [{ company_id: 'company-1', email: 'recruiter@acme.com' }]

    const interviewInsert = vi.fn().mockResolvedValue({ error: null })
    const notificationInsert = vi.fn().mockResolvedValue({ error: null })

    const appsEq = vi.fn().mockResolvedValue({ data: applicationRows, error: null })
    const appsSelect = vi.fn(() => ({ eq: appsEq }))

    const recruitersEq = vi.fn().mockResolvedValue({ data: recruiterRows, error: null })
    const recruitersSelect = vi.fn(() => ({ eq: recruitersEq }))

    const from = vi.fn((table: string) => {
      if (table === 'applications') return { select: appsSelect }
      if (table === 'recruiters') return { select: recruitersSelect }
      if (table === 'interviews') return { insert: interviewInsert }
      if (table === 'notifications') return { insert: notificationInsert }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    mockGetSupabaseClient.mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    mockTransitionStage.mockResolvedValue()

    const result = await processCalendarSignal({
      userId: 'user-1',
      calendarEventId: 'evt-acme-1',
      title: 'Acme interview panel',
      organizerEmail: 'recruiter@acme.com',
      attendeeEmails: ['john@bktadvisory.com'],
      locationOrLink: 'https://meet.google.com/acme',
      scheduledAtIso: '2026-06-08T16:00:00.000Z',
      durationMinutes: 60,
    })

    expect(result.status).toBe('matched')
    expect(result.applicationId).toBe('app-10')
    expect(result.transitioned).toBe(true)
    expect(interviewInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        application_id: 'app-10',
        calendar_event_id: 'evt-acme-1',
      }),
    )
    expect(mockTransitionStage).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-10',
        fromStage: 'screening',
        toStage: 'interview_scheduled',
        actor: 'calendar_scraper',
      }),
    )
    expect(notificationInsert).toHaveBeenCalledTimes(1)
  })
})