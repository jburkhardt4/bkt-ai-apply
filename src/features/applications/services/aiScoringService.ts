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

/**
 * Thrown when the `score-job-fit` Edge Function fails. Carries the normalized
 * provider error so callers can log the specific cause and tag the persisted
 * fallback (e.g. `edge_function_error:auth`) instead of a generic string.
 */
export class ScoreJobFitEdgeError extends Error {
  readonly code: string
  readonly provider: string
  readonly status?: number

  constructor(message: string, details: { code: string; provider: string; status?: number }) {
    super(message)
    this.name = 'ScoreJobFitEdgeError'
    this.code = details.code
    this.provider = details.provider
    this.status = details.status
  }
}

/** The normalized error body the `score-job-fit` Edge Function returns on failure. */
interface EdgeErrorBody {
  error?: string
  code?: string
  provider?: string
}

/**
 * supabase-js v2 surfaces a `FunctionsHttpError` whose `.context` is the
 * `Response`. Read the normalized `{ error, code, provider }` JSON body
 * defensively (never throws; returns null when it cannot be parsed).
 */
async function readEdgeErrorBody(error: unknown): Promise<EdgeErrorBody | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context
  try {
    const body = await context?.json?.()
    return (body as EdgeErrorBody | undefined) ?? null
  } catch {
    return null
  }
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

/** Persists the deterministic heuristic score (flagged) as the explicit fallback.
 *  Exported so callers (e.g. ingestionService) can persist a degraded-but-specific
 *  score after catching a ScoreJobFitEdgeError, tagged with the real reason
 *  (`edge_function_error:<code>`). Threshold logic stays inside persistAiScore. */
export async function persistScoreFallback(
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

// Hard ceiling on the score-job-fit Edge invoke. Corpus jobs (crawled ATS boards)
// carry the full description_text — far larger than a SerpApi snippet — so the LLM
// call can run long; without a bound, a single hung call strands the sequential
// batch scoring loop (handleScoreJobs) forever. On timeout we abort and surface a
// typed Edge error so the caller persists a heuristic fallback — the job still gets
// a score (BR-104). Transport/UX bound, not a business threshold (cf. LSN-001).
const SCORE_JOB_FIT_TIMEOUT_MS = 30_000

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
 * 4. On Edge-Function error: THROW a ScoreJobFitEdgeError carrying the real
 *    provider code. Callers log the specific cause and persist a
 *    degraded-but-specific fallback via persistScoreFallback (no silent mask).
 */
export async function scoreJobFitWithLlm(
  input: ScoreJobFitWithLlmInput,
): Promise<ScoreJobFitWithLlmResult> {
  const route = await routeAiTask({ userId: input.userId, taskType: 'match_scoring' })

  // BR-052 / BR-104: under the monthly cap, non-critical scoring is queued. We
  // persist the heuristic fallback; persistAiScore re-routes and returns queued.
  if (route.costDecision.shouldBlock) {
    return persistScoreFallback(input, 'cost_cap')
  }

  const supabase = getSupabaseClient()

  // Abort the invoke if it outruns the ceiling so a hung Edge call can't strand a
  // batch scoring loop. supabase-js forwards `signal` to the underlying fetch.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SCORE_JOB_FIT_TIMEOUT_MS)
  let data: EdgeJobFitResponse | null
  let error: unknown
  try {
    const res = await supabase.functions.invoke<EdgeJobFitResponse>('score-job-fit', {
      body: {
        provider: route.modelProvider,
        model: route.modelName,
        job: input.job,
        profile: input.profile,
      },
      signal: controller.signal,
    })
    data = res.data
    error = res.error
  } catch (err) {
    // invoke throws on abort (timeout) or a transport-level failure. Normalize to a
    // typed Edge error so runScoreForJob persists a heuristic fallback (degraded but
    // specific) instead of letting the batch hang.
    const aborted =
      controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
    throw new ScoreJobFitEdgeError(
      aborted
        ? `score-job-fit timed out after ${SCORE_JOB_FIT_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : 'score-job-fit failed',
      { code: aborted ? 'timeout' : 'transport_error', provider: route.modelProvider },
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (error) {
    // Edge Function returned a normalized error body `{ error, code, provider }`.
    // THROW the real cause (no masking) so callers log the specific provider
    // code and persist a degraded-but-specific fallback (BR observability).
    const body = await readEdgeErrorBody(error)
    throw new ScoreJobFitEdgeError(
      body?.error ?? (error as Error).message ?? 'score-job-fit failed',
      {
        code: body?.code ?? 'unknown',
        provider: body?.provider ?? route.modelProvider,
      },
    )
  }

  if (!data) {
    // No transport error but an empty body — still an Edge Function failure.
    throw new ScoreJobFitEdgeError('score-job-fit returned an empty response', {
      code: 'empty_response',
      provider: route.modelProvider,
    })
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
    return persistScoreFallback(input, 'cost_cap')
  }
  return { status: 'saved', decision: persisted.decision, source: 'llm', overallScore: match.overall }
}