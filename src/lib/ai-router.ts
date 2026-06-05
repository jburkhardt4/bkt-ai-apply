import { getSupabaseClient } from './supabase'
import type { Database } from '../types/db.types'
import type { AiCostPolicyStatus, AiModelProvider, AiTaskType } from '../types/pipeline'

export const AI_MONTHLY_COST_CAP_USD = 75
export const AI_WARNING_80_PERCENT_USD = 60
export const AI_WARNING_90_PERCENT_USD = 67.5

type AiUsageInsert = Database['public']['Tables']['ai_model_usage']['Insert']

interface RoutingEntry {
  taskType: AiTaskType
  modelName: string
  modelProvider: AiModelProvider
  isCritical: boolean
}

const ROUTING_MATRIX: Record<AiTaskType, RoutingEntry> = {
  cover_letter_generation: {
    taskType: 'cover_letter_generation',
    modelName: 'Claude Opus 4.6',
    modelProvider: 'anthropic',
    isCritical: false,
  },
  interview_prep: {
    taskType: 'interview_prep',
    modelName: 'Claude Opus 4.6',
    modelProvider: 'anthropic',
    isCritical: false,
  },
  match_scoring: {
    taskType: 'match_scoring',
    modelName: 'Claude Opus 4.6',
    modelProvider: 'anthropic',
    isCritical: false,
  },
  resume_rewriting: {
    taskType: 'resume_rewriting',
    modelName: 'GPT-5',
    modelProvider: 'openai',
    isCritical: false,
  },
  browser_form_automation: {
    taskType: 'browser_form_automation',
    modelName: 'GPT-5',
    modelProvider: 'openai',
    isCritical: false,
  },
  company_market_research: {
    taskType: 'company_market_research',
    modelName: 'Gemini 2.5 Pro',
    modelProvider: 'google',
    isCritical: false,
  },
  email_classification: {
    taskType: 'email_classification',
    modelName: 'Gemini 2.5 Flash',
    modelProvider: 'google',
    isCritical: true,
  },
  intent_routing: {
    taskType: 'intent_routing',
    modelName: 'Gemini 2.5 Flash',
    modelProvider: 'google',
    isCritical: false,
  },
  general_qa: {
    taskType: 'general_qa',
    modelName: 'Claude Sonnet 4.6',
    modelProvider: 'anthropic',
    isCritical: false,
  },
}

export interface AiCostDecision {
  monthlySpendUsd: number
  status: AiCostPolicyStatus
  shouldBlock: boolean
}

export interface AiRouteDecision extends RoutingEntry {
  costDecision: AiCostDecision
}

function getUtcMonthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export function evaluateAiCostPolicy(monthlySpendUsd: number, isCritical: boolean): AiCostDecision {
  if (monthlySpendUsd >= AI_MONTHLY_COST_CAP_USD) {
    if (isCritical) {
      return {
        monthlySpendUsd,
        status: 'capped_critical_override',
        shouldBlock: false,
      }
    }

    return {
      monthlySpendUsd,
      status: 'capped_non_critical',
      shouldBlock: true,
    }
  }

  if (monthlySpendUsd >= AI_WARNING_90_PERCENT_USD) {
    return {
      monthlySpendUsd,
      status: 'warn_90',
      shouldBlock: false,
    }
  }

  if (monthlySpendUsd >= AI_WARNING_80_PERCENT_USD) {
    return {
      monthlySpendUsd,
      status: 'warn_80',
      shouldBlock: false,
    }
  }

  return {
    monthlySpendUsd,
    status: 'ok',
    shouldBlock: false,
  }
}

export async function getMonthlyAiSpendUsd(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const monthStart = getUtcMonthStartIso()

  const { data, error } = await supabase
    .from('ai_model_usage')
    .select('estimated_cost_usd')
    .eq('user_id', userId)
    .gte('called_at', monthStart)

  if (error) {
    throw new Error(`Failed to fetch monthly AI spend: ${error.message}`)
  }

  return (data ?? []).reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0)
}

export async function routeAiTask(params: { userId: string; taskType: AiTaskType }): Promise<AiRouteDecision> {
  const entry = ROUTING_MATRIX[params.taskType]
  const monthlySpendUsd = await getMonthlyAiSpendUsd(params.userId)

  return {
    ...entry,
    costDecision: evaluateAiCostPolicy(monthlySpendUsd, entry.isCritical),
  }
}

export async function logAiUsage(usage: AiUsageInsert): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('ai_model_usage').insert(usage)

  if (error) {
    throw new Error(`Failed to log AI usage: ${error.message}`)
  }
}