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
  email_draft: {
    taskType: 'email_draft',
    modelName: 'Gemini 2.5 Flash',
    modelProvider: 'google',
    isCritical: false,
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
  jd_formatting: {
    taskType: 'jd_formatting',
    modelName: 'Claude 3.5 Haiku',
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

// ---------------------------------------------------------------------------
// User-selectable chat models (general_qa)
//
// The conversational assistant lets the user switch models. Selecting a
// non-default model is a JB manual override (AI-RULE-001); the act of choosing
// it in the AI Assistant UI is the confirmation. Per the routing implementation
// contract, model names live here (and only here) — the model selector and the
// Edge Function provider clients both key off these pinned display names.
// ---------------------------------------------------------------------------

export interface ChatModelOption {
  /** Pinned display name — the single source of truth for the model name. */
  modelName: string
  provider: AiModelProvider
  label: string
  description: string
}

export const CHAT_MODEL_CATALOG: ChatModelOption[] = [
  {
    modelName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    label: 'Claude Sonnet 4.6',
    description: 'Fast, cost-efficient general chat (default).',
  },
  {
    modelName: 'Claude Opus 4.6',
    provider: 'anthropic',
    label: 'Claude Opus 4.6',
    description: 'Highest-quality reasoning for complex questions.',
  },
  {
    modelName: 'GPT-5',
    provider: 'openai',
    label: 'GPT-5',
    description: 'OpenAI flagship for broad general tasks.',
  },
  {
    modelName: 'GPT-4o',
    provider: 'openai',
    label: 'GPT-4o',
    description: 'Fast, multimodal OpenAI model.',
  },
  {
    modelName: 'Gemini 2.5 Pro',
    provider: 'google',
    label: 'Gemini 2.5 Pro',
    description: 'Google long-context retrieval and synthesis.',
  },
]

/** The pinned default chat model (mirrors the general_qa routing entry). */
export const DEFAULT_CHAT_MODEL_NAME = ROUTING_MATRIX.general_qa.modelName

export function getChatModelOption(modelName: string): ChatModelOption | undefined {
  return CHAT_MODEL_CATALOG.find((m) => m.modelName === modelName)
}

/**
 * Resolves the effective chat model + provider for a turn. A known override from
 * the catalog wins; otherwise the general_qa default applies. Unknown names are
 * never forwarded to a provider.
 */
export function resolveChatModel(modelName?: string | null): {
  modelName: string
  modelProvider: AiModelProvider
} {
  const override = modelName ? getChatModelOption(modelName) : undefined
  if (override) {
    return { modelName: override.modelName, modelProvider: override.provider }
  }
  return {
    modelName: DEFAULT_CHAT_MODEL_NAME,
    modelProvider:
      getChatModelOption(DEFAULT_CHAT_MODEL_NAME)?.provider ??
      ROUTING_MATRIX.general_qa.modelProvider,
  }
}

export interface ModelPricing {
  inputUsdPerToken: number
  outputUsdPerToken: number
}

// Approximate provider list prices (USD per token) for cost logging only
// (AI-RULE-002); refine as pricing changes. The fallback applies to any model
// not listed so logging never silently records $0.
const MODEL_PRICING_BY_NAME: Record<string, ModelPricing> = {
  'Claude Sonnet 4.6': { inputUsdPerToken: 3 / 1_000_000, outputUsdPerToken: 15 / 1_000_000 },
  'Claude Opus 4.6': { inputUsdPerToken: 15 / 1_000_000, outputUsdPerToken: 75 / 1_000_000 },
  'GPT-5': { inputUsdPerToken: 5 / 1_000_000, outputUsdPerToken: 15 / 1_000_000 },
  'GPT-4o': { inputUsdPerToken: 2.5 / 1_000_000, outputUsdPerToken: 10 / 1_000_000 },
  'Gemini 2.5 Pro': { inputUsdPerToken: 1.25 / 1_000_000, outputUsdPerToken: 5 / 1_000_000 },
  // Mirrored in supabase/functions/gmail-sync/logic.ts (server-side classification logging)
  'Gemini 2.5 Flash': { inputUsdPerToken: 0.3 / 1_000_000, outputUsdPerToken: 2.5 / 1_000_000 },
  // Low-latency JD normalization (jd_formatting). Anthropic list price for Haiku 3.5.
  'Claude 3.5 Haiku': { inputUsdPerToken: 0.8 / 1_000_000, outputUsdPerToken: 4 / 1_000_000 },
}

const FALLBACK_PRICING: ModelPricing = {
  inputUsdPerToken: 3 / 1_000_000,
  outputUsdPerToken: 15 / 1_000_000,
}

export function getModelPricing(modelName: string): ModelPricing {
  return MODEL_PRICING_BY_NAME[modelName] ?? FALLBACK_PRICING
}