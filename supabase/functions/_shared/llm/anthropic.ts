/**
 * Anthropic provider client — Messages API.
 * https://docs.anthropic.com/en/api/messages
 */
import type { ChatTurn, LlmProvider, LlmRequest, LlmResponse } from './types.ts'
import { LlmError, codeFromHttpStatus } from './errors.ts'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

// Display name → API model id. Model names are pinned in src/lib/ai-router.ts.
const MODEL_ID_BY_NAME: Record<string, string> = {
  'Claude Sonnet 4.6': 'claude-sonnet-4-6',
  'Claude Opus 4.6': 'claude-opus-4-8',
  'Claude Opus 4.8': 'claude-opus-4-8',
}
const DEFAULT_MODEL_ID = 'claude-sonnet-4-6'

interface AnthropicResponse {
  content?: { type?: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export const anthropicProvider: LlmProvider = {
  id: 'anthropic',

  resolveModelId(displayName: string): string {
    return MODEL_ID_BY_NAME[displayName] ?? DEFAULT_MODEL_ID
  },

  async complete(request: LlmRequest, apiKey: string): Promise<LlmResponse> {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.resolveModelId(request.model),
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages.map((m: ChatTurn) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new LlmError({
        provider: 'anthropic',
        status: res.status,
        code: codeFromHttpStatus(res.status, detail),
        message: `Anthropic error ${res.status}: ${detail.slice(0, 500)}`,
      })
    }

    const payload = (await res.json()) as AnthropicResponse
    const text = Array.isArray(payload.content)
      ? payload.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      : ''

    return {
      text,
      usage: {
        input_tokens: payload.usage?.input_tokens ?? 0,
        output_tokens: payload.usage?.output_tokens ?? 0,
      },
    }
  },
}
