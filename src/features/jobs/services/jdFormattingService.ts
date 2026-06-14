/**
 * jdFormattingService — normalizes a raw scraped job description into clean,
 * uniform Markdown via the routed LLM (`format-jd` Edge Function).
 *
 * Mirrors the thin-client contract used across the app (chatCompletionService /
 * aiScoringService): routing + cost gating + usage logging go through
 * src/lib/ai-router.ts; the Edge Function holds the provider key and does the
 * model call. No model names are chosen here — the routed display name
 * (jd_formatting → Claude 3.5 Haiku) is forwarded to the function.
 *
 * Graceful degradation: if the monthly cost cap is hit (non-critical task) or
 * the Edge Function errors, we return the RAW description flagged as a
 * `fallback` so the sidebar always renders something readable.
 */
import { getSupabaseClient } from '@/lib/supabase'
import { getModelPricing, logAiUsage, routeAiTask } from '@/lib/ai-router'

const JD_FORMATTING_TASK = 'jd_formatting' as const
const MAX_OUTPUT_TOKENS = 1536

interface EdgeFormatJdResponse {
  markdown: string
  usage: { input_tokens: number; output_tokens: number }
}

export interface FormatJobDescriptionInput {
  userId: string
  /** The raw, possibly-messy scraped description (may be null/empty). */
  rawDescription: string | null
}

export interface FormatJobDescriptionResult {
  /** Clean Markdown when source === 'llm'; the raw text when 'fallback'. */
  markdown: string
  source: 'llm' | 'fallback'
}

/**
 * Formats a raw job description into normalized Markdown.
 *
 * 1. Empty input → empty fallback (caller renders its own "no description" state).
 * 2. routeAiTask(jd_formatting) cost gate. Under the cap, skip the call and
 *    return the raw text (flagged), logging zero usage (AI-RULE-002 / BR-054).
 * 3. Otherwise invoke `format-jd` with the routed provider/model. On success,
 *    log real usage and return the Markdown. On any error, return the raw text.
 */
export async function formatJobDescription(
  input: FormatJobDescriptionInput,
): Promise<FormatJobDescriptionResult> {
  const raw = (input.rawDescription ?? '').trim()
  if (raw.length === 0) {
    return { markdown: '', source: 'fallback' }
  }

  const route = await routeAiTask({ userId: input.userId, taskType: JD_FORMATTING_TASK })

  // BR-052: under the monthly cap, non-critical formatting is skipped. Record a
  // zero-usage row (mirrors the chat "deferred" path) and render the raw text.
  if (route.costDecision.shouldBlock) {
    await logAiUsage({
      user_id: input.userId,
      model_provider: route.modelProvider,
      model_name: route.modelName,
      task_type: route.taskType,
      tokens_in: 0,
      tokens_out: 0,
      estimated_cost_usd: 0,
      application_id: null,
    })
    return { markdown: raw, source: 'fallback' }
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<EdgeFormatJdResponse>('format-jd', {
    body: {
      provider: route.modelProvider,
      model: route.modelName,
      description: raw,
      maxTokens: MAX_OUTPUT_TOKENS,
    },
  })

  if (error || !data || typeof data.markdown !== 'string' || data.markdown.length === 0) {
    // Edge Function unreachable or returned a normalized error — render the raw
    // description so the panel stays usable.
    return { markdown: raw, source: 'fallback' }
  }

  const pricing = getModelPricing(route.modelName)
  const tokensIn = data.usage?.input_tokens ?? 0
  const tokensOut = data.usage?.output_tokens ?? 0
  const estimatedCostUsd = Number(
    (tokensIn * pricing.inputUsdPerToken + tokensOut * pricing.outputUsdPerToken).toFixed(6),
  )

  await logAiUsage({
    user_id: input.userId,
    model_provider: route.modelProvider,
    model_name: route.modelName,
    task_type: route.taskType,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: estimatedCostUsd,
    application_id: null,
  })

  return { markdown: data.markdown, source: 'llm' }
}
