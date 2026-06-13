/**
 * Shared LLM provider vocabulary for the multi-model abstraction.
 *
 * Pure types only — no runtime/Deno dependencies — so the same contract is
 * reused across every provider client (anthropic/openai/google), the factory,
 * and the error mapper.
 */

export type LlmProviderId = 'anthropic' | 'openai' | 'google'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  /** ai-router pinned display name, e.g. "Claude Sonnet 4.6". */
  model: string
  system: string
  messages: ChatTurn[]
  maxTokens: number
  /** Gemini-only: token budget for the model's internal "thinking". Set to 0
   *  to disable it for fast structured tasks (classification, short drafts) —
   *  on Gemini 2.5 Flash, thinking can otherwise consume the whole output
   *  budget and return empty text. Ignored by providers that don't support it. */
  thinkingBudget?: number
}

export interface LlmUsage {
  input_tokens: number
  output_tokens: number
}

export interface LlmResponse {
  text: string
  usage: LlmUsage
}

export interface LlmProvider {
  readonly id: LlmProviderId
  /** Maps an ai-router display name to this provider's API model id. */
  resolveModelId(displayName: string): string
  /** Performs a single non-streaming completion. Throws LlmError on failure. */
  complete(request: LlmRequest, apiKey: string): Promise<LlmResponse>
}
