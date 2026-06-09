/**
 * OpenAI provider client — Chat Completions API.
 * https://platform.openai.com/docs/api-reference/chat
 */
import type { LlmProvider, LlmRequest, LlmResponse } from './types.ts'
import { LlmError, codeFromHttpStatus } from './errors.ts'

const API_URL = 'https://api.openai.com/v1/chat/completions'

// Display name → API model id. Model names are pinned in src/lib/ai-router.ts.
const MODEL_ID_BY_NAME: Record<string, string> = {
  'GPT-5': 'gpt-5',
  'GPT-4o': 'gpt-4o',
  'GPT-4o mini': 'gpt-4o-mini',
}
const DEFAULT_MODEL_ID = 'gpt-4o'

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export const openaiProvider: LlmProvider = {
  id: 'openai',

  resolveModelId(displayName: string): string {
    return MODEL_ID_BY_NAME[displayName] ?? DEFAULT_MODEL_ID
  },

  async complete(request: LlmRequest, apiKey: string): Promise<LlmResponse> {
    // OpenAI carries the system prompt as the first message in the array.
    const messages = [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.resolveModelId(request.model),
        max_tokens: request.maxTokens,
        messages,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new LlmError({
        provider: 'openai',
        status: res.status,
        code: codeFromHttpStatus(res.status, detail),
        message: `OpenAI error ${res.status}: ${detail.slice(0, 500)}`,
      })
    }

    const payload = (await res.json()) as OpenAiResponse
    const text = payload.choices?.[0]?.message?.content ?? ''

    return {
      text,
      usage: {
        input_tokens: payload.usage?.prompt_tokens ?? 0,
        output_tokens: payload.usage?.completion_tokens ?? 0,
      },
    }
  },
}
