import type { Json } from '../../../types/db.types'
import { getSupabaseClient } from '../../../lib/supabase'
import { getModelPricing, logAiUsage, routeAiTask } from '../../../lib/ai-router'
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

// ---------------------------------------------------------------------------
// Real LLM scoring (Phase 2c) — wires the `score-job-fit` Edge Function to the
// existing persistAiScore path. The heuristic pipelineService.scoreJobFit()
// stays as the explicit fallback for cost-cap and Edge-Function-error paths.
//
// Threshold mapping is NEVER hardcoded here: persistAiScore →
// buildScoringDecision → getScoreLabel/toDbRecommendation own BR-020 (>=60
// consider), BR-021 (>=80 apply), BR-022 (<60 reject). The Edge Function's own
// recommendation is advisory; the persisted recommendation is derived from the
// overall score so the dashboard stays internally consistent (LSN-001).
// ---------------------------------------------------------------------------

/** The structured score returned by the `score-job-fit` Edge Function (0-100 ints). */
interface EdgeJobFitScore {
  overall_score: number
  skills_score: number
  domain_score: number
  seniority_score: number
  tools_score: number
  location_auth_score: number
  recommendation: MatchRecommendation
  strengths: string[]
  gaps: string[]
  reasoning_trace: Record<string, unknown>
}

interface EdgeJobFitResponse {
  score: EdgeJobFitScore
  usage: { input_tokens: number; output_tokens: number }
}

export interface ScoreJobFitWithLlmInput {
  userId: string
  jobId: string
  /** The job posting / JD passed verbatim to the Edge Function (unknown shape). */
  job: unknown
  /** The candidate master profile passed verbatim to the Edge Function. */
  profile: unknown
  /** The deterministic heuristic score, used as the cost-cap / error fallback. */
  heuristicMatch: MatchResult
  /** Reasoning trace recorded when the heuristic fallback is persisted. */
  heuristicReasoningTrace: Json
  applicationId?: string
}

export type ScoreJobFitWithLlmResult =
  | {
      status: 'queued'
      decision: ScoringDecision
      reason: string
      source: 'heuristic_fallback'
      overallScore: number
    }
  | {
      status: 'saved'
      decision: ScoringDecision
      source: 'llm' | 'heuristic_fallback'
      overallScore: number
    }

/** Maps the Edge Function's 0-100 sub-scores into the client MatchResult shape. */
function edgeScoreToMatchResult(score: EdgeJobFitScore, heuristic: MatchResult): MatchResult {
  return {
    overall: score.overall_score,
    // The LLM does not return a threshold; reuse the master-profile threshold
    // carried on the heuristic result so MatchResult stays complete (BR-021).
    threshold: heuristic.threshold,
    thresholdPassed: score.overall_score >= heuristic.threshold,
    breakdown: {
      skills: score.skills_score,
      domain: score.domain_score,
      seniority: score.seniority_score,
      tools: score.tools_score,
      locationAuth: score.location_auth_score,
    },
    strengths: score.strengths,
    gaps: score.gaps,
  }
}

/** Persists the deterministic heuristic score (flagged) as the explicit fallback. */
async function persistHeuristicFallback(
  input: ScoreJobFitWithLlmInput,
  reason: string,
): Promise<ScoreJobFitWithLlmResult> {
  const baseTrace =
    typeof input.heuristicReasoningTrace === 'object' &&
    input.heuristicReasoningTrace !== null &&
    !Array.isArray(input.heuristicReasoningTrace)
      ? input.heuristicReasoningTrace
      : {}

  const reasoningTrace: Json = {
    ...(baseTrace as Record<string, Json>),
    source: 'heuristic_fallback',
    reason,
  }

  const persisted = await persistAiScore({
    userId: input.userId,
    jobId: input.jobId,
    match: input.heuristicMatch,
    reasoningTrace,
    // Heuristic scoring makes no LLM call; usage/cost are zero (BR-054).
    tokensIn: 0,
    tokensOut: 0,
    estimatedCostUsd: 0,
    applicationId: input.applicationId,
  })

  if (persisted.status === 'queued') {
    return {
      status: 'queued',
      decision: persisted.decision,
      reason: persisted.reason,
      source: 'heuristic_fallback',
      overallScore: input.heuristicMatch.overall,
    }
  }
  return {
    status: 'saved',
    decision: persisted.decision,
    source: 'heuristic_fallback',
    overallScore: input.heuristicMatch.overall,
  }
}

/**
 * Scores a job via the routed LLM (`score-job-fit` Edge Function) and persists
 * the result through the existing persistAiScore path.
 *
 * 1. routeAiTask(match_scoring) → cost gate. If blocked, persist the heuristic
 *    fallback (flagged), which keeps persistAiScore's {status:'queued'}
 *    semantics (it re-routes internally and queues under the cap, BR-052).
 * 2. Otherwise invoke the Edge Function with the routed provider/model.
 * 3. On success: map score→MatchResult, price usage via getModelPricing, and
 *    persist with reasoning_trace = the model's reasoning_trace (BR-024).
 * 4. On Edge-Function error: persist the heuristic fallback (flagged) so the
 *    dashboard still gets a score.
 */
export async function scoreJobFitWithLlm(
  input: ScoreJobFitWithLlmInput,
): Promise<ScoreJobFitWithLlmResult> {
  const route = await routeAiTask({ userId: input.userId, taskType: 'match_scoring' })

  // BR-052 / BR-104: under the monthly cap, non-critical scoring is queued. We
  // persist the heuristic fallback; persistAiScore re-routes and returns queued.
  if (route.costDecision.shouldBlock) {
    return persistHeuristicFallback(input, 'cost_cap')
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<EdgeJobFitResponse>('score-job-fit', {
    body: {
      provider: route.modelProvider,
      model: route.modelName,
      job: input.job,
      profile: input.profile,
    },
  })

  if (error || !data) {
    // Edge Function unreachable or returned a normalized error — fall back so
    // the dashboard still gets a score (flagged for QA / audit).
    return persistHeuristicFallback(input, 'edge_function_error')
  }

  const match = edgeScoreToMatchResult(data.score, input.heuristicMatch)
  const pricing = getModelPricing(route.modelName)
  const tokensIn = data.usage.input_tokens
  const tokensOut = data.usage.output_tokens
  const estimatedCostUsd = Number(
    (tokensIn * pricing.inputUsdPerToken + tokensOut * pricing.outputUsdPerToken).toFixed(6),
  )

  const persisted = await persistAiScore({
    userId: input.userId,
    jobId: input.jobId,
    match,
    reasoningTrace: data.score.reasoning_trace as Json,
    tokensIn,
    tokensOut,
    estimatedCostUsd,
    applicationId: input.applicationId,
  })

  if (persisted.status === 'queued') {
    // A race where the cap was crossed between routeAiTask reads — persist the
    // heuristic fallback so the queued contract is honored consistently.
    return persistHeuristicFallback(input, 'cost_cap')
  }
  return { status: 'saved', decision: persisted.decision, source: 'llm', overallScore: match.overall }
}