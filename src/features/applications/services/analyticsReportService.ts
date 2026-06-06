import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/db.types'

type ApplicationAnalyticsRow = Pick<
  Database['public']['Tables']['applications']['Row'],
  'id' | 'job_id' | 'created_at' | 'stage' | 'match_score'
>

type JobAnalyticsRow = Pick<Database['public']['Tables']['jobs']['Row'], 'id' | 'source' | 'company_id'>
type CompanyAnalyticsRow = Pick<Database['public']['Tables']['companies']['Row'], 'id' | 'industry'>

export interface SourceConversionMetric {
  source: string
  totalApplications: number
  convertedApplications: number
  conversionRate: number
}

export interface IndustryInterviewMetric {
  industry: string
  totalApplications: number
  interviewReachedApplications: number
  interviewRate: number
}

export interface ScoreOutcomeDistributionMetric {
  outcome: string
  applicationCount: number
  averageScore: number | null
  highScoreShare: number
}

export interface ScoreOutcomeTrendPoint {
  month: string
  applicationCount: number
  averageScore: number | null
  successRate: number
  rejectionRate: number
}

export interface AnalyticsReport {
  generatedAtIso: string
  conversionBySource: SourceConversionMetric[]
  interviewRateByIndustry: IndustryInterviewMetric[]
  scoreOutcomeDistribution: ScoreOutcomeDistributionMetric[]
  scoreOutcomeTrend: ScoreOutcomeTrendPoint[]
}

type OutcomeGroup = 'hired' | 'offer' | 'rejected' | 'ghosted' | 'in_progress'

const INTERVIEW_REACHED_STAGES = new Set([
  'interview_scheduled',
  'interview_complete',
  'offer',
  'hired',
])

function roundPercent(value: number): number {
  return Number(value.toFixed(1))
}

function normalizeLabel(value: string | null, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function safeMonth(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'unknown'
  }

  return value.slice(0, 7)
}

function rate(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return roundPercent((part / total) * 100)
}

function toOutcome(stage: string): OutcomeGroup {
  if (stage === 'hired') {
    return 'hired'
  }

  if (stage === 'offer') {
    return 'offer'
  }

  if (stage === 'rejected') {
    return 'rejected'
  }

  if (stage === 'ghosted') {
    return 'ghosted'
  }

  return 'in_progress'
}

function isConverted(stage: string): boolean {
  return stage !== 'discovery'
}

function hasInterviewReached(stage: string): boolean {
  return INTERVIEW_REACHED_STAGES.has(stage)
}

export function buildAnalyticsReport(params: {
  applications: ApplicationAnalyticsRow[]
  jobsById: Map<string, JobAnalyticsRow>
  companiesById: Map<string, CompanyAnalyticsRow>
}): Omit<AnalyticsReport, 'generatedAtIso'> {
  const sourceAccumulator = new Map<string, { total: number; converted: number }>()
  const industryAccumulator = new Map<string, { total: number; interviewReached: number }>()
  const outcomeAccumulator = new Map<OutcomeGroup, { count: number; scoredCount: number; scoreTotal: number; highScoreCount: number }>()
  const monthlyAccumulator = new Map<string, { count: number; scoredCount: number; scoreTotal: number; successCount: number; rejectionCount: number }>()

  for (const application of params.applications) {
    const job = params.jobsById.get(application.job_id)
    const source = normalizeLabel(job?.source ?? null, 'Unknown source')
    const company = job?.company_id ? params.companiesById.get(job.company_id) : undefined
    const industry = normalizeLabel(company?.industry ?? null, 'Unknown industry')
    const converted = isConverted(application.stage)
    const interviewReached = hasInterviewReached(application.stage)
    const outcome = toOutcome(application.stage)
    const month = safeMonth(application.created_at)
    const score = typeof application.match_score === 'number' ? application.match_score : null

    const sourceMetric = sourceAccumulator.get(source) ?? { total: 0, converted: 0 }
    sourceMetric.total += 1
    if (converted) {
      sourceMetric.converted += 1
    }
    sourceAccumulator.set(source, sourceMetric)

    const industryMetric = industryAccumulator.get(industry) ?? { total: 0, interviewReached: 0 }
    industryMetric.total += 1
    if (interviewReached) {
      industryMetric.interviewReached += 1
    }
    industryAccumulator.set(industry, industryMetric)

    const outcomeMetric = outcomeAccumulator.get(outcome) ?? {
      count: 0,
      scoredCount: 0,
      scoreTotal: 0,
      highScoreCount: 0,
    }
    outcomeMetric.count += 1
    if (score !== null) {
      outcomeMetric.scoredCount += 1
      outcomeMetric.scoreTotal += score
      if (score >= 80) {
        outcomeMetric.highScoreCount += 1
      }
    }
    outcomeAccumulator.set(outcome, outcomeMetric)

    const monthlyMetric = monthlyAccumulator.get(month) ?? {
      count: 0,
      scoredCount: 0,
      scoreTotal: 0,
      successCount: 0,
      rejectionCount: 0,
    }
    monthlyMetric.count += 1
    if (score !== null) {
      monthlyMetric.scoredCount += 1
      monthlyMetric.scoreTotal += score
    }
    if (outcome === 'hired' || outcome === 'offer') {
      monthlyMetric.successCount += 1
    }
    if (outcome === 'rejected' || outcome === 'ghosted') {
      monthlyMetric.rejectionCount += 1
    }
    monthlyAccumulator.set(month, monthlyMetric)
  }

  const conversionBySource: SourceConversionMetric[] = Array.from(sourceAccumulator.entries())
    .map(([source, value]) => ({
      source,
      totalApplications: value.total,
      convertedApplications: value.converted,
      conversionRate: rate(value.converted, value.total),
    }))
    .sort((left, right) => right.conversionRate - left.conversionRate || right.totalApplications - left.totalApplications)

  const interviewRateByIndustry: IndustryInterviewMetric[] = Array.from(industryAccumulator.entries())
    .map(([industry, value]) => ({
      industry,
      totalApplications: value.total,
      interviewReachedApplications: value.interviewReached,
      interviewRate: rate(value.interviewReached, value.total),
    }))
    .sort((left, right) => right.interviewRate - left.interviewRate || right.totalApplications - left.totalApplications)

  const scoreOutcomeDistribution: ScoreOutcomeDistributionMetric[] = Array.from(outcomeAccumulator.entries())
    .map(([outcome, value]) => ({
      outcome,
      applicationCount: value.count,
      averageScore: value.scoredCount === 0 ? null : Number((value.scoreTotal / value.scoredCount).toFixed(1)),
      highScoreShare: rate(value.highScoreCount, value.count),
    }))
    .sort((left, right) => right.applicationCount - left.applicationCount || left.outcome.localeCompare(right.outcome))

  const scoreOutcomeTrend: ScoreOutcomeTrendPoint[] = Array.from(monthlyAccumulator.entries())
    .map(([month, value]) => ({
      month,
      applicationCount: value.count,
      averageScore: value.scoredCount === 0 ? null : Number((value.scoreTotal / value.scoredCount).toFixed(1)),
      successRate: rate(value.successCount, value.count),
      rejectionRate: rate(value.rejectionCount, value.count),
    }))
    .sort((left, right) => left.month.localeCompare(right.month))

  return {
    conversionBySource,
    interviewRateByIndustry,
    scoreOutcomeDistribution,
    scoreOutcomeTrend,
  }
}

export async function getAnalyticsReport(userId: string): Promise<AnalyticsReport> {
  const supabase = getSupabaseClient()

  const [applicationsResult, jobsResult] = await Promise.all([
    supabase
      .from('applications')
      .select('id, job_id, created_at, stage, match_score')
      .eq('user_id', userId),
    supabase.from('jobs').select('id, source, company_id').eq('user_id', userId),
  ])

  const { data: applicationsData, error: applicationsError } = applicationsResult
  if (applicationsError) {
    throw new Error(`Failed to load analytics applications: ${applicationsError.message}`)
  }

  const { data: jobsData, error: jobsError } = jobsResult
  if (jobsError) {
    throw new Error(`Failed to load analytics jobs: ${jobsError.message}`)
  }

  const jobs = (jobsData ?? []) as JobAnalyticsRow[]
  const jobsById = new Map(jobs.map((job) => [job.id, job]))
  const companyIds = Array.from(new Set(jobs.map((job) => job.company_id).filter((value): value is string => typeof value === 'string')))

  let companiesById = new Map<string, CompanyAnalyticsRow>()
  if (companyIds.length > 0) {
    const { data: companiesData, error: companiesError } = await supabase
      .from('companies')
      .select('id, industry')
      .in('id', companyIds)

    if (companiesError) {
      throw new Error(`Failed to load analytics companies: ${companiesError.message}`)
    }

    const companies = (companiesData ?? []) as CompanyAnalyticsRow[]
    companiesById = new Map(companies.map((company) => [company.id, company]))
  }

  const report = buildAnalyticsReport({
    applications: (applicationsData ?? []) as ApplicationAnalyticsRow[],
    jobsById,
    companiesById,
  })

  return {
    generatedAtIso: new Date().toISOString(),
    ...report,
  }
}