import { getSupabaseClient } from '../../../lib/supabase'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'
import type { PipelineStage } from '../../../types/pipeline'
import { canTransitionStage } from '../domain/stageRules'
import { transitionStage } from './applicationService'

export type GmailClassification =
  | 'interview_invite'
  | 'rejection'
  | 'offer'
  | 'outreach'
  | 'follow_up'

export interface GmailIntelligenceInput {
  userId: string
  gmailMessageId: string
  fromAddress: string
  subject?: string | null
  bodySnippet?: string | null
  receivedAtIso: string
  applicationId?: string | null
}

export interface GmailIntelligenceResult {
  classification: GmailClassification
  confidence: number
  autoActioned: boolean
  transitionedToStage: PipelineStage | null
  reason: string
}

interface ClassificationRule {
  classification: GmailClassification
  keywords: string[]
}

const AUTO_ACTION_CONFIDENCE_THRESHOLD = 0.7

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    classification: 'offer',
    keywords: ['offer', 'compensation package', 'pleased to offer', 'offer letter', 'congratulations'],
  },
  {
    classification: 'rejection',
    keywords: [
      'not moving forward',
      'unfortunately',
      'regret to inform',
      'decided to move forward with other candidates',
      'decline',
      'rejected',
    ],
  },
  {
    classification: 'interview_invite',
    keywords: [
      'interview',
      'schedule',
      'availability',
      'calendar invite',
      'meet with the team',
      'technical screen',
    ],
  },
  {
    classification: 'outreach',
    keywords: [
      'reaching out',
      'opportunity',
      'your background',
      'open role',
      'connect regarding',
      'hiring for',
    ],
  },
  {
    classification: 'follow_up',
    keywords: ['follow up', 'checking in', 'circling back', 'gentle reminder', 'any updates'],
  },
]

const STAGE_BY_CLASSIFICATION: Partial<Record<GmailClassification, PipelineStage>> = {
  interview_invite: 'interview_scheduled',
  rejection: 'rejected',
  offer: 'offer',
}

function normalizeText(input: GmailIntelligenceInput): string {
  return [input.subject, input.bodySnippet, input.fromAddress]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function classifyGmailMessage(input: GmailIntelligenceInput): {
  classification: GmailClassification
  confidence: number
  matchedKeywords: string[]
} {
  const text = normalizeText(input)

  let bestRule: ClassificationRule = CLASSIFICATION_RULES[CLASSIFICATION_RULES.length - 1]
  let bestMatches: string[] = []

  for (const rule of CLASSIFICATION_RULES) {
    const matches = rule.keywords.filter((keyword) => text.includes(keyword))

    if (matches.length > bestMatches.length) {
      bestRule = rule
      bestMatches = matches
    }
  }

  const confidence =
    bestMatches.length === 0 ? 0.55 : clamp(0.58 + bestMatches.length * 0.12, 0.58, 0.97)

  return {
    classification: bestRule.classification,
    confidence: Number(confidence.toFixed(3)),
    matchedKeywords: bestMatches,
  }
}

async function fetchApplicationStage(params: {
  userId: string
  applicationId: string
}): Promise<PipelineStage | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('applications')
    .select('id, stage')
    .eq('id', params.applicationId)
    .eq('user_id', params.userId)
    .single()

  if (error) {
    return null
  }

  return data.stage as PipelineStage
}

async function createNotification(params: {
  userId: string
  applicationId: string | null
  title: string
  body: string
}): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    application_id: params.applicationId,
    notification_type: 'ai_signal',
    title: params.title,
    body: params.body,
  })

  if (error) {
    throw new Error(`Failed to write notification: ${error.message}`)
  }
}

export async function processGmailSignal(input: GmailIntelligenceInput): Promise<GmailIntelligenceResult> {
  const route = await routeAiTask({
    userId: input.userId,
    taskType: 'email_classification',
  })

  await logAiUsage({
    user_id: input.userId,
    model_provider: route.modelProvider,
    model_name: route.modelName,
    task_type: route.taskType,
    tokens_in: 0,
    tokens_out: 0,
    estimated_cost_usd: 0,
    application_id: input.applicationId ?? null,
  })

  const classificationDecision = classifyGmailMessage(input)
  const shouldAutoAction = classificationDecision.confidence >= AUTO_ACTION_CONFIDENCE_THRESHOLD

  let autoActioned = false
  let transitionedToStage: PipelineStage | null = null
  let reason: string

  if (shouldAutoAction && input.applicationId) {
    const currentStage = await fetchApplicationStage({
      userId: input.userId,
      applicationId: input.applicationId,
    })

    const targetStage = STAGE_BY_CLASSIFICATION[classificationDecision.classification]

    if (!targetStage) {
      reason = 'Classification does not map to a stage transition.'
    } else if (!currentStage) {
      reason = 'No matching application found for auto-action.'
    } else if (classificationDecision.classification === 'rejection' && currentStage === 'offer') {
      reason = 'Offer-stage protection applied; rejection requires manual confirmation.'
    } else if (currentStage === targetStage) {
      reason = 'Application already at target stage; transition skipped.'
    } else if (!canTransitionStage(currentStage, targetStage)) {
      reason = `Transition ${currentStage} -> ${targetStage} is not allowed.`
    } else {
      await transitionStage({
        applicationId: input.applicationId,
        userId: input.userId,
        fromStage: currentStage,
        toStage: targetStage,
        reason: `Auto-transition from Gmail classification: ${classificationDecision.classification}`,
        actor: 'gmail_scraper',
      })

      autoActioned = true
      transitionedToStage = targetStage
      reason = `Auto-transitioned to ${targetStage}.`
    }
  } else if (shouldAutoAction && !input.applicationId) {
    reason = 'Confidence met threshold but no application mapping was provided.'
  } else {
    reason = 'Confidence below 0.70; email stored without auto-action.'
  }

  const supabase = getSupabaseClient()
  const { error: emailError } = await supabase.from('emails').insert({
    user_id: input.userId,
    application_id: input.applicationId ?? null,
    gmail_message_id: input.gmailMessageId,
    from_address: input.fromAddress,
    subject: input.subject ?? null,
    body_snippet: input.bodySnippet ?? null,
    classification: classificationDecision.classification,
    confidence: classificationDecision.confidence,
    auto_actioned: autoActioned,
    received_at: input.receivedAtIso,
    processed_at: new Date().toISOString(),
  })

  if (emailError) {
    throw new Error(`Failed to persist email intelligence record: ${emailError.message}`)
  }

  await createNotification({
    userId: input.userId,
    applicationId: input.applicationId ?? null,
    title: `Email classified: ${classificationDecision.classification}`,
    body: `Confidence ${(classificationDecision.confidence * 100).toFixed(1)}%. ${reason}`,
  })

  return {
    classification: classificationDecision.classification,
    confidence: classificationDecision.confidence,
    autoActioned,
    transitionedToStage,
    reason,
  }
}