/**
 * Google Gemini provider client — generateContent API.
 * https://ai.google.dev/api/generate-content
 */
import type { LlmProvider, LlmRequest, LlmResponse } from './types.ts'
import { LlmError, codeFromHttpStatus } from './errors.ts'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Display name → API model id. Model names are pinned in src/lib/ai-router.ts.
const MODEL_ID_BY_NAME: Record<string, string> = {
  'Gemini 2.5 Pro': 'gemini-2.5-pro',
  'Gemini 2.5 Flash': 'gemini-2.5-flash',
}
const DEFAULT_MODEL_ID = 'gemini-2.5-pro'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export const googleProvider: LlmProvider = {
  id: 'google',

  resolveModelId(displayName: string): string {
    return MODEL_ID_BY_NAME[displayName] ?? DEFAULT_MODEL_ID
  },

  async complete(request: LlmRequest, apiKey: string): Promise<LlmResponse> {
    const modelId = this.resolveModelId(request.model)
    const url = `${API_BASE}/${modelId}:generateContent`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header auth keeps the key out of the URL/query string and logs.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
        // Gemini uses 'model' for the assistant role and 'user' for the user.
        contents: request.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: request.maxTokens,
          // thinkingBudget: 0 disables Gemini 2.5 "thinking" so it doesn't
          // spend the output budget reasoning and return empty text.
          ...(request.thinkingBudget != null
            ? { thinkingConfig: { thinkingBudget: request.thinkingBudget } }
            : {}),
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new LlmError({
        provider: 'google',
        status: res.status,
        code: codeFromHttpStatus(res.status, detail),
        message: `Gemini error ${res.status}: ${detail.slice(0, 500)}`,
      })
    }

    const payload = (await res.json()) as GeminiResponse
    const text =
      payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

    return {
      text,
      usage: {
        input_tokens: payload.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      },
    }
  },
}
