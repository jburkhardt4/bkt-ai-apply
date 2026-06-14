/**
 * chatCompletionService — orchestrates one assistant turn.
 *
 * Flow: ensure conversation → persist user message → cost gate (routeAiTask) →
 * build system prompt (pipeline context + long-term memory) + recent history →
 * call the ai-chat Edge Function (holds ANTHROPIC_API_KEY) → persist assistant
 * reply → log real token usage → extract + persist new long-term memories.
 *
 * Routing/cost go through src/lib/ai-router.ts (no model names are chosen here;
 * the routed display name is forwarded to the Edge Function, which maps it to an
 * Anthropic model id). One LLM call per turn — memory extraction is folded into
 * the same reply via a MEMORY directive.
 */

import { getSupabaseClient } from '@/lib/supabase'
import { readEdgeFunctionError } from '@/lib/edgeFunctionError'
import { getModelPricing, logAiUsage, resolveChatModel, routeAiTask } from '@/lib/ai-router'
import {
  classifyChatIntent,
  getPipelineContextSummary,
  type PipelineContextSummary,
} from '@/features/applications/services/chatAssistantService'
import {
  appendMessage,
  createConversation,
  getMessages,
  touchConversation,
} from './chatConversationsService'
import { addMemoriesDeduped, listMemory } from './chatMemoryService'
import type { ChatMessage } from '../types'

const CHAT_TASK_TYPE = 'general_qa' as const
const HISTORY_LIMIT = 20
const MAX_OUTPUT_TOKENS = 1024

interface EdgeChatResponse {
  text: string
  usage: { input_tokens: number; output_tokens: number }
}

export interface SendChatInput {
  userId: string
  message: string
  conversationId?: string | null
  applicationId?: string | null
  /** Optional user-selected model (a JB manual override of the general_qa default). */
  modelName?: string | null
}

export interface SendChatResult {
  conversationId: string
  assistantMessage: ChatMessage
  status: 'answered' | 'deferred'
  memoryAdded: number
}

const MEMORY_LINE = /^MEMORY:\s*(.+)$/i

/** Splits a reply into displayable text and any MEMORY directives it carries. */
export function extractMemories(reply: string): { cleaned: string; memories: string[] } {
  const memories: string[] = []
  const kept: string[] = []
  for (const line of reply.split('\n')) {
    const match = line.match(MEMORY_LINE)
    if (match) memories.push(match[1].trim())
    else kept.push(line)
  }
  return { cleaned: kept.join('\n').trim(), memories }
}

/** Derives a short conversation title from the first user message. */
export function deriveTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, ' ')
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 45)}…`
}

export function buildSystemPrompt(context: PipelineContextSummary, memory: string[]): string {
  const stageSnapshot =
    Object.entries(context.stageCounts)
      .map(([stage, count]) => `${stage}: ${count}`)
      .join(', ') || 'none yet'

  const memoryBlock =
    memory.length > 0 ? memory.map((m) => `- ${m}`).join('\n') : '- (nothing remembered yet)'

  return [
    'You are the BKT AI-Apply assistant for John Burkhardt, who runs an automated job-application pipeline.',
    'Be concise, concrete, and practical. Prefer specific next steps over generic advice.',
    '',
    'Live pipeline context:',
    `- Applications tracked: ${context.applicationsTracked}`,
    `- Average match score: ${context.averageMatchScore ?? 'n/a'}`,
    `- High-match (>=80): ${context.highMatchCount}`,
    `- Stage snapshot: ${stageSnapshot}`,
    '',
    'Long-term memory about the user:',
    memoryBlock,
    '',
    'If you learn a durable fact or stable preference about the user worth remembering in future conversations, append it on its own final line formatted exactly as:',
    'MEMORY: <the durable fact>',
    'Only include genuinely durable facts (one per line), never ones already listed above. Omit entirely if there is nothing new.',
  ].join('\n')
}

export async function sendChatMessage(input: SendChatInput): Promise<SendChatResult> {
  const message = input.message.trim()
  if (!message) throw new Error('Message is empty')

  // 1. Ensure a conversation (title new ones from the first user message).
  let conversationId = input.conversationId ?? null
  if (!conversationId) {
    const conversation = await createConversation(input.userId, deriveTitle(message))
    conversationId = conversation.id
  }

  // 2. Persist the user message.
  await appendMessage({
    conversationId,
    userId: input.userId,
    role: 'user',
    content: message,
  })

  const intent = classifyChatIntent(message)

  // 3. Cost gate — defer (without an LLM call) when the monthly cap is hit.
  // Cost policy keys off the general_qa task; the model that actually runs is
  // the user's selection (or the general_qa default) resolved from the catalog.
  const route = await routeAiTask({ userId: input.userId, taskType: CHAT_TASK_TYPE })
  const chosen = resolveChatModel(input.modelName)
  if (route.costDecision.shouldBlock) {
    await logAiUsage({
      user_id: input.userId,
      model_provider: chosen.modelProvider,
      model_name: chosen.modelName,
      task_type: route.taskType,
      tokens_in: 0,
      tokens_out: 0,
      estimated_cost_usd: 0,
      application_id: input.applicationId ?? null,
    })

    const deferredText =
      'I have paused because the monthly AI budget cap has been reached for non-critical tasks. This request will work again after the cap resets.'
    const assistantMessage = await appendMessage({
      conversationId,
      userId: input.userId,
      role: 'assistant',
      content: deferredText,
      metadata: { status: 'deferred', intent, costStatus: route.costDecision.status },
    })
    await touchConversation(conversationId)
    return { conversationId, assistantMessage, status: 'deferred', memoryAdded: 0 }
  }

  // 4. Assemble context, long-term memory, and recent history (in parallel).
  const [context, memoryItems, history] = await Promise.all([
    getPipelineContextSummary(input.userId),
    listMemory(input.userId),
    getMessages(conversationId),
  ])
  const system = buildSystemPrompt(
    context,
    memoryItems.map((m) => m.content),
  )
  const priorTurns = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 5. Call the ai-chat Edge Function (server-side, provider-agnostic). The
  // function routes to the chosen provider and holds the key (never the client).
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<EdgeChatResponse>('ai-chat', {
    body: {
      provider: chosen.modelProvider,
      model: chosen.modelName,
      system,
      messages: priorTurns,
      maxTokens: MAX_OUTPUT_TOKENS,
    },
  })
  if (error || !data) {
    // Surface the function's real `{ error }` body (e.g. a missing-key message)
    // rather than the SDK's generic "non-2xx status code" string.
    throw new Error(await readEdgeFunctionError(error, 'AI chat function returned no data'))
  }

  // 6. Split reply from MEMORY directives; persist the assistant message.
  const { cleaned, memories } = extractMemories(data.text)
  const replyText = cleaned.length > 0 ? cleaned : data.text.trim()
  const tokensIn = data.usage.input_tokens
  const tokensOut = data.usage.output_tokens
  const pricing = getModelPricing(chosen.modelName)
  const estimatedCostUsd = Number(
    (tokensIn * pricing.inputUsdPerToken + tokensOut * pricing.outputUsdPerToken).toFixed(6),
  )

  const assistantMessage = await appendMessage({
    conversationId,
    userId: input.userId,
    role: 'assistant',
    content: replyText,
    metadata: {
      status: 'answered',
      intent,
      model: chosen.modelName,
      provider: chosen.modelProvider,
      tokensIn,
      tokensOut,
      estimatedCostUsd,
    },
  })

  // 7. Log real usage (AI-RULE-002) and persist new long-term memories.
  await logAiUsage({
    user_id: input.userId,
    model_provider: chosen.modelProvider,
    model_name: chosen.modelName,
    task_type: route.taskType,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: estimatedCostUsd,
    application_id: input.applicationId ?? null,
  })
  const memoryAdded = await addMemoriesDeduped(input.userId, memories, conversationId)

  await touchConversation(conversationId)

  return { conversationId, assistantMessage, status: 'answered', memoryAdded }
}
