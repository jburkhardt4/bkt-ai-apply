import { getSupabaseClient } from '../../../lib/supabase'
import {
  AI_MONTHLY_COST_CAP_USD,
  AI_WARNING_80_PERCENT_USD,
  AI_WARNING_90_PERCENT_USD,
  evaluateAiCostPolicy,
} from '../../../lib/ai-router'
import type { Database } from '../../../types/db.types'

type AiUsageRow = Pick<
  Database['public']['Tables']['ai_model_usage']['Row'],
  'estimated_cost_usd' | 'model_name' | 'model_provider' | 'task_type'
>

export interface SpendBreakdownEntry {
  key: string
  spendUsd: number
  shareOfMonthlySpend: number
}

export interface MonthlyAiSpendSummary {
  monthStartIso: string
  monthlySpendUsd: number
  capUsd: number
  warning80Usd: number
  warning90Usd: number
  usagePercentOfCap: number
  policyStatus: ReturnType<typeof evaluateAiCostPolicy>['status']
  shouldBlockNonCritical: boolean
  thresholdStatus: {
    reached80Percent: boolean
    reached90Percent: boolean
    reachedCap: boolean
  }
  spendByProvider: SpendBreakdownEntry[]
  spendByModel: SpendBreakdownEntry[]
  spendByTaskType: SpendBreakdownEntry[]
}

export interface AiCostStatus {
  bannerState: 'ok' | 'warning' | 'alert' | 'blocked'
  bannerTitle: string
  bannerBody: string
  summary: MonthlyAiSpendSummary
}

function getUtcMonthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function roundSpend(value: number): number {
  return Number(value.toFixed(2))
}

function percentageOfTotal(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Number(((part / total) * 100).toFixed(1))
}

function toSortedBreakdown(
  totals: Map<string, number>,
  monthlySpendUsd: number,
): SpendBreakdownEntry[] {
  return Array.from(totals.entries())
    .map(([key, spendUsd]) => ({
      key,
      spendUsd: roundSpend(spendUsd),
      shareOfMonthlySpend: percentageOfTotal(spendUsd, monthlySpendUsd),
    }))
    .sort((left, right) => right.spendUsd - left.spendUsd || left.key.localeCompare(right.key))
}

function buildBanner(summary: MonthlyAiSpendSummary): AiCostStatus {
  const policyStatus = summary.policyStatus

  if (policyStatus === 'capped_non_critical') {
    return {
      bannerState: 'blocked',
      bannerTitle: 'AI cap reached',
      bannerBody: 'Monthly AI spend has reached the hard cap. Non-critical calls will be queued.',
      summary,
    }
  }

  if (policyStatus === 'warn_90') {
    return {
      bannerState: 'alert',
      bannerTitle: 'AI spend nearing cap',
      bannerBody: 'Monthly AI spend is above 90% of the cap.',
      summary,
    }
  }

  if (policyStatus === 'warn_80') {
    return {
      bannerState: 'warning',
      bannerTitle: 'AI spend above warning threshold',
      bannerBody: 'Monthly AI spend is above 80% of the cap.',
      summary,
    }
  }

  return {
    bannerState: 'ok',
    bannerTitle: 'AI spend within budget',
    bannerBody: 'Monthly AI spend is below the warning threshold.',
    summary,
  }
}

export async function getMonthlyAiSpendSummary(userId: string): Promise<MonthlyAiSpendSummary> {
  const supabase = getSupabaseClient()
  const monthStartIso = getUtcMonthStartIso()

  const { data, error } = await supabase
    .from('ai_model_usage')
    .select('estimated_cost_usd, model_name, model_provider, task_type')
    .eq('user_id', userId)
    .gte('called_at', monthStartIso)

  if (error) {
    throw new Error(`Failed to load monthly AI spend summary: ${error.message}`)
  }

  const usageRows = (data ?? []) as AiUsageRow[]
  const providerTotals = new Map<string, number>()
  const modelTotals = new Map<string, number>()
  const taskTypeTotals = new Map<string, number>()

  const monthlySpendUsd = usageRows.reduce((total, row) => {
    const spend = Number(row.estimated_cost_usd ?? 0)

    providerTotals.set(row.model_provider, (providerTotals.get(row.model_provider) ?? 0) + spend)
    modelTotals.set(row.model_name, (modelTotals.get(row.model_name) ?? 0) + spend)
    taskTypeTotals.set(row.task_type, (taskTypeTotals.get(row.task_type) ?? 0) + spend)

    return total + spend
  }, 0)

  const policyDecision = evaluateAiCostPolicy(monthlySpendUsd, false)

  return {
    monthStartIso,
    monthlySpendUsd: roundSpend(monthlySpendUsd),
    capUsd: AI_MONTHLY_COST_CAP_USD,
    warning80Usd: AI_WARNING_80_PERCENT_USD,
    warning90Usd: AI_WARNING_90_PERCENT_USD,
    usagePercentOfCap: percentageOfTotal(monthlySpendUsd, AI_MONTHLY_COST_CAP_USD),
    policyStatus: policyDecision.status,
    shouldBlockNonCritical: policyDecision.shouldBlock,
    thresholdStatus: {
      reached80Percent: monthlySpendUsd >= AI_WARNING_80_PERCENT_USD,
      reached90Percent: monthlySpendUsd >= AI_WARNING_90_PERCENT_USD,
      reachedCap: monthlySpendUsd >= AI_MONTHLY_COST_CAP_USD,
    },
    spendByProvider: toSortedBreakdown(providerTotals, monthlySpendUsd),
    spendByModel: toSortedBreakdown(modelTotals, monthlySpendUsd),
    spendByTaskType: toSortedBreakdown(taskTypeTotals, monthlySpendUsd),
  }
}

export async function getAiCostStatus(userId: string): Promise<AiCostStatus> {
  const summary = await getMonthlyAiSpendSummary(userId)
  return buildBanner(summary)
}