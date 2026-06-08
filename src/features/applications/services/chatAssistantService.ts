import { getSupabaseClient } from '../../../lib/supabase'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'
import type { AiCostPolicyStatus, AiTaskType } from '../../../types/pipeline'
import type { Database } from '../../../types/db.types'

type ApplicationContextRow = Pick<
  Database['public']['Tables']['applications']['Row'],
  'id' | 'stage' | 'match_score' | 'updated_at'
>

type AiScoreContextRow = Pick<
  Database['public']['Tables']['ai_scores']['Row'],
  'job_id' | 'overall_score' | 'recommendation' | 'scored_at'
>

export type ChatIntent =
  | 'score_explanation'
  | 'follow_up_drafting'
  | 'strategy_filter_suggestions'
  | 'general_qa'

export type ChatAssistantCostStatus = 'ok' | 'warn' | 'capped'

interface UsageEstimate {
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
}

export interface ChatAssistantInput {
  userId: string
  message: string
  applicationId?: string
}

export interface PipelineContextSummary {
  applicationsTracked: number
  averageMatchScore: number | null
  highMatchCount: number
  stageCounts: Record<string, number>
  recentAiScoreAverage: number | null
}

interface RoutedModelSummary {
  modelName: string
  modelProvider: string
}

interface ChatAssistantResponseBase {
  intent: ChatIntent
  taskType: AiTaskType
  routedModel: RoutedModelSummary
  costStatus: ChatAssistantCostStatus
  costPolicyStatus: AiCostPolicyStatus
  monthlySpendUsd: number
  contextSummary: PipelineContextSummary
  suggestedActions?: string[]
}

export interface ChatAssistantAnsweredResponse extends ChatAssistantResponseBase {
  status: 'answered'
  answerText: string
}

export interface ChatAssistantDeferredResponse extends ChatAssistantResponseBase {
  status: 'deferred'
  answerText: string
  deferredReason: string
}

export type ChatAssistantResponse = ChatAssistantAnsweredResponse | ChatAssistantDeferredResponse

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function estimateUsage(promptText: string, outputText: string): UsageEstimate {
  const tokensIn = Math.max(1, Math.ceil(promptText.length / 4))
  const tokensOut = Math.max(1, Math.ceil(outputText.length / 4))

  return {
    tokensIn,
    tokensOut,
    estimatedCostUsd: Number((tokensIn * 0.000005 + tokensOut * 0.000007).toFixed(6)),
  }
}

function estimateIntentRoutingUsage(message: string): UsageEstimate {
  const tokensIn = Math.max(1, Math.ceil(message.length / 4))

  return {
    tokensIn,
    tokensOut: 8,
    estimatedCostUsd: Number((tokensIn * 0.000001 + 8 * 0.0000015).toFixed(6)),
  }
}

export function classifyChatIntent(message: string): ChatIntent {
  const normalized = normalizeLine(message).toLowerCase()

  if (
    /(match score|score|why .*score|explain .*score|reasoning trace|fit score|score breakdown)/.test(
      normalized,
    )
  ) {
    return 'score_explanation'
  }

  if (/(follow up|follow-up|recruiter email|draft email|reply to recruiter|send a note)/.test(normalized)) {
    return 'follow_up_drafting'
  }

  if (/(filter|strategy|search strategy|target companies|pipeline strategy|narrow)/.test(normalized)) {
    return 'strategy_filter_suggestions'
  }

  return 'general_qa'
}

export function mapIntentToTaskType(intent: ChatIntent): AiTaskType {
  if (intent === 'score_explanation') {
    return 'match_scoring'
  }

  if (intent === 'follow_up_drafting') {
    return 'cover_letter_generation'
  }

  if (intent === 'strategy_filter_suggestions') {
    return 'company_market_research'
  }

  return 'general_qa'
}

function mapCostStatus(status: AiCostPolicyStatus): ChatAssistantCostStatus {
  if (status === 'warn_80' || status === 'warn_90') {
    return 'warn'
  }

  if (status === 'capped_non_critical' || status === 'capped_critical_override') {
    return 'capped'
  }

  return 'ok'
}

function summarizePipelineContext(
  applications: ApplicationContextRow[],
  aiScores: AiScoreContextRow[],
): PipelineContextSummary {
  const stageCounts = applications.reduce<Record<string, number>>((counts, row) => {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1
    return counts
  }, {})

  const scoredApplications = applications.filter((row) => row.match_score !== null)
  const averageMatchScore =
    scoredApplications.length === 0
      ? null
      : Number(
          (
            scoredApplications.reduce((total, row) => total + Number(row.match_score ?? 0), 0) /
            scoredApplications.length
          ).toFixed(1),
        )

  const recentAiScoreAverage =
    aiScores.length === 0
      ? null
      : Number(
          (aiScores.reduce((total, row) => total + Number(row.overall_score ?? 0), 0) / aiScores.length).toFixed(1),
        )

  const highMatchCount = applications.filter((row) => Number(row.match_score ?? 0) >= 80).length

  return {
    applicationsTracked: applications.length,
    averageMatchScore,
    highMatchCount,
    stageCounts,
    recentAiScoreAverage,
  }
}

export async function getPipelineContextSummary(userId: string): Promise<PipelineContextSummary> {
  const supabase = getSupabaseClient()

  const applicationsQuery = supabase
    .from('applications')
    .select('id, stage, match_score, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  const aiScoresQuery = supabase
    .from('ai_scores')
    .select('job_id, overall_score, recommendation, scored_at')
    .eq('user_id', userId)
    .order('scored_at', { ascending: false })
    .limit(50)

  const [{ data: applicationRows, error: applicationsError }, { data: aiScoreRows, error: aiScoresError }] =
    await Promise.all([applicationsQuery, aiScoresQuery])

  if (applicationsError) {
    throw new Error(`Failed to load application context: ${applicationsError.message}`)
  }

  if (aiScoresError) {
    throw new Error(`Failed to load AI score context: ${aiScoresError.message}`)
  }

  return summarizePipelineContext(
    (applicationRows ?? []) as ApplicationContextRow[],
    (aiScoreRows ?? []) as AiScoreContextRow[],
  )
}

function buildSuggestedActions(intent: ChatIntent, context: PipelineContextSummary): string[] {
  if (intent === 'score_explanation') {
    return [
      'Open one application with match_score below 60 and identify top 2 missing requirements.',
      'Compare strongest and weakest score dimensions before your next application batch.',
    ]
  }

  if (intent === 'follow_up_drafting') {
    return [
      'Send one follow-up within 24 hours after each interview-related stage transition.',
      'Include one quantified accomplishment and one explicit next-step ask in each follow-up.',
    ]
  }

  if (intent === 'strategy_filter_suggestions') {
    const appliedCount = context.stageCounts.applied ?? 0
    return [
      `Prioritize companies where role requirements match your strongest outcomes (${context.highMatchCount} high-match entries currently tracked).`,
      `Set a weekly target to move at least ${Math.max(1, appliedCount)} opportunities from applied to screening.`,
    ]
  }

  return ['Review your top 5 opportunities by match score and focus outreach on those this week.']
}

function buildAnswerText(params: {
  intent: ChatIntent
  message: string
  context: PipelineContextSummary
}): string {
  const normalizedMessage = normalizeLine(params.message)
  const stageSnapshot = Object.entries(params.context.stageCounts)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(', ')

  if (params.intent === 'score_explanation') {
    const averageScoreText =
      params.context.averageMatchScore === null
        ? 'No scored applications yet.'
        : `Current average match score is ${params.context.averageMatchScore}.`

    return [
      `Score explanation for: ${normalizedMessage}`,
      averageScoreText,
      `You currently have ${params.context.highMatchCount} applications at or above 80, which aligns with Auto-Submit Prep readiness.`,
      stageSnapshot.length > 0 ? `Pipeline stage snapshot: ${stageSnapshot}.` : 'Pipeline stage snapshot is currently empty.',
    ].join(' ')
  }

  if (params.intent === 'follow_up_drafting') {
    return [
      'Draft follow-up:',
      'Hi [Recruiter Name], thanks again for the update. I am very interested in the role and can provide any additional detail needed. ',
      'Recent pipeline momentum indicates continued progress; I would welcome a quick next-step discussion this week.',
      'Best, John',
    ].join('')
  }

  if (params.intent === 'strategy_filter_suggestions') {
    return [
      `Strategy suggestion based on ${params.context.applicationsTracked} tracked applications:`,
      `focus your next search pass on signals similar to your ${params.context.highMatchCount} high-match opportunities,`,
      'and deprioritize roles that repeatedly score below 60 unless they offer a unique domain advantage.',
      stageSnapshot.length > 0 ? ` Current stage distribution is ${stageSnapshot}.` : '',
    ].join(' ')
  }

  return [
    `General guidance for: ${normalizedMessage}`,
    `You are tracking ${params.context.applicationsTracked} applications with ${params.context.highMatchCount} high-match opportunities.`,
    'A practical next move is to prioritize high-match roles in active stages and keep outreach cadence consistent.',
  ].join(' ')
}

function buildDeferredResponse(params: {
  intent: ChatIntent
  taskType: AiTaskType
  modelName: string
  modelProvider: string
  costPolicyStatus: AiCostPolicyStatus
  monthlySpendUsd: number
  contextSummary: PipelineContextSummary
}): ChatAssistantDeferredResponse {
  return {
    status: 'deferred',
    answerText:
      'AI assistant request deferred because the monthly AI cap is reached for non-critical tasks. Your request has been queued for the next billing window.',
    deferredReason: 'Monthly AI cost cap reached for non-critical task.',
    intent: params.intent,
    taskType: params.taskType,
    routedModel: {
      modelName: params.modelName,
      modelProvider: params.modelProvider,
    },
    costStatus: mapCostStatus(params.costPolicyStatus),
    costPolicyStatus: params.costPolicyStatus,
    monthlySpendUsd: params.monthlySpendUsd,
    contextSummary: params.contextSummary,
    suggestedActions: ['Review current AI spend in the AI Cost Monitor.', 'Retry this request after the monthly cap resets.'],
  }
}

export async function runChatAssistant(input: ChatAssistantInput): Promise<ChatAssistantResponse> {
  const message = normalizeLine(input.message)
  const intent = classifyChatIntent(message)

  const intentRoute = await routeAiTask({
    userId: input.userId,
    taskType: 'intent_routing',
  })

  if (intentRoute.costDecision.shouldBlock) {
    await logAiUsage({
      user_id: input.userId,
      model_provider: intentRoute.modelProvider,
      model_name: intentRoute.modelName,
      task_type: intentRoute.taskType,
      tokens_in: 0,
      tokens_out: 0,
      estimated_cost_usd: 0,
      application_id: input.applicationId ?? null,
    })

    return buildDeferredResponse({
      intent,
      taskType: intentRoute.taskType,
      modelName: intentRoute.modelName,
      modelProvider: intentRoute.modelProvider,
      costPolicyStatus: intentRoute.costDecision.status,
      monthlySpendUsd: intentRoute.costDecision.monthlySpendUsd,
      contextSummary: {
        applicationsTracked: 0,
        averageMatchScore: null,
        highMatchCount: 0,
        stageCounts: {},
        recentAiScoreAverage: null,
      },
    })
  }

  const intentUsage = estimateIntentRoutingUsage(message)
  await logAiUsage({
    user_id: input.userId,
    model_provider: intentRoute.modelProvider,
    model_name: intentRoute.modelName,
    task_type: intentRoute.taskType,
    tokens_in: intentUsage.tokensIn,
    tokens_out: intentUsage.tokensOut,
    estimated_cost_usd: intentUsage.estimatedCostUsd,
    application_id: input.applicationId ?? null,
  })

  const taskType = mapIntentToTaskType(intent)
  const responseRoute = await routeAiTask({
    userId: input.userId,
    taskType,
  })

  const contextSummary = await getPipelineContextSummary(input.userId)

  if (responseRoute.costDecision.shouldBlock) {
    await logAiUsage({
      user_id: input.userId,
      model_provider: responseRoute.modelProvider,
      model_name: responseRoute.modelName,
      task_type: responseRoute.taskType,
      tokens_in: 0,
      tokens_out: 0,
      estimated_cost_usd: 0,
      application_id: input.applicationId ?? null,
    })

    return buildDeferredResponse({
      intent,
      taskType,
      modelName: responseRoute.modelName,
      modelProvider: responseRoute.modelProvider,
      costPolicyStatus: responseRoute.costDecision.status,
      monthlySpendUsd: responseRoute.costDecision.monthlySpendUsd,
      contextSummary,
    })
  }

  const answerText = buildAnswerText({
    intent,
    message,
    context: contextSummary,
  })

  const responseUsage = estimateUsage(message, answerText)
  await logAiUsage({
    user_id: input.userId,
    model_provider: responseRoute.modelProvider,
    model_name: responseRoute.modelName,
    task_type: responseRoute.taskType,
    tokens_in: responseUsage.tokensIn,
    tokens_out: responseUsage.tokensOut,
    estimated_cost_usd: responseUsage.estimatedCostUsd,
    application_id: input.applicationId ?? null,
  })

  return {
    status: 'answered',
    answerText,
    intent,
    taskType,
    routedModel: {
      modelName: responseRoute.modelName,
      modelProvider: responseRoute.modelProvider,
    },
    costStatus: mapCostStatus(responseRoute.costDecision.status),
    costPolicyStatus: responseRoute.costDecision.status,
    monthlySpendUsd: responseRoute.costDecision.monthlySpendUsd,
    contextSummary,
    suggestedActions: buildSuggestedActions(intent, contextSummary),
  }
}