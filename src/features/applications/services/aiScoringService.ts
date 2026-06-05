import type { Json } from '../../../types/db.types'
import { getSupabaseClient } from '../../../lib/supabase'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'
import type { MatchRecommendation, MatchRecommendationLabel, MatchResult } from '../../../types/pipeline'

interface ScoringDecision {
  label: MatchRecommendationLabel
  recommendation: MatchRecommendation
  shouldQueueForCostCap: boolean
}

export interface PersistAiScoreInput {
  userId: string
  jobId: string
  match: MatchResult
  reasoningTrace: Json
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
  applicationId?: string
}

export function getScoreLabel(overallScore: number): MatchRecommendationLabel {
  if (overallScore >= 80) {
    return 'Auto-Submit Prep'
  }

  if (overallScore >= 60) {
    return 'Consideration'
  }

  return 'Reject'
}

export function toDbRecommendation(overallScore: number): MatchRecommendation {
  if (overallScore >= 80) {
    return 'apply'
  }

  if (overallScore >= 60) {
    return 'consider'
  }

  return 'reject'
}

export function buildScoringDecision(params: {
  overallScore: number
  isBlockedByCap: boolean
}): ScoringDecision {
  return {
    label: getScoreLabel(params.overallScore),
    recommendation: toDbRecommendation(params.overallScore),
    shouldQueueForCostCap: params.isBlockedByCap,
  }
}

export async function persistAiScore(input: PersistAiScoreInput): Promise<
  | { status: 'queued'; decision: ScoringDecision; reason: string }
  | { status: 'saved'; decision: ScoringDecision }
> {
  const route = await routeAiTask({
    userId: input.userId,
    taskType: 'match_scoring',
  })

  const decision = buildScoringDecision({
    overallScore: input.match.overall,
    isBlockedByCap: route.costDecision.shouldBlock,
  })

  if (decision.shouldQueueForCostCap) {
    return {
      status: 'queued',
      decision,
      reason: 'Monthly AI cost cap reached for non-critical task.',
    }
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.from('ai_scores').insert({
    user_id: input.userId,
    job_id: input.jobId,
    overall_score: input.match.overall,
    skills_score: input.match.breakdown.skills,
    domain_score: input.match.breakdown.domain,
    seniority_score: input.match.breakdown.seniority,
    tools_score: input.match.breakdown.tools,
    location_auth_score: input.match.breakdown.locationAuth,
    recommendation: decision.recommendation,
    strengths: input.match.strengths,
    gaps: input.match.gaps,
    model_used: route.modelName,
    reasoning_trace: input.reasoningTrace,
  })

  if (error) {
    throw new Error(`Failed to persist AI score: ${error.message}`)
  }

  await logAiUsage({
    user_id: input.userId,
    model_provider: route.modelProvider,
    model_name: route.modelName,
    task_type: route.taskType,
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    estimated_cost_usd: input.estimatedCostUsd,
    application_id: input.applicationId ?? null,
  })

  return {
    status: 'saved',
    decision,
  }
}