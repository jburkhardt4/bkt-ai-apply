/**
 * Shared JD-normalization prompt + helpers.
 *
 * Single source of truth for the "format a raw scraped job description into
 * clean Markdown" task (jd_formatting). Consumed by:
 *   - format-jd/index.ts        (JWT-gated, client-driven render / lazy backfill)
 *   - prospector-cron/index.ts  (service-role, creation-time formatting)
 *
 * Keeping the system prompt + fence-stripping here guarantees both paths emit
 * identical formatting regardless of the originating job board.
 */
import { getProvider } from './llm/factory.ts'
import type { LlmProviderId, LlmUsage } from './llm/types.ts'

/** The exact JD-normalization instruction set (verbatim — do not drift). */
export const JD_FORMAT_SYSTEM_PROMPT = [
  'You are a precise parsing assistant for a professional job board. Your task is to take raw, messy job descriptions and instantly output a cleanly formatted Markdown version.',
  'Rules:',
  "1. Use standard Markdown headers (`###`) for core sections: 'About the Role', 'Key Responsibilities', and 'Requirements/Qualifications'.",
  '2. Convert all lists to standard bullet points (`*`).',
  '3. Strip out excessive company promotional fluff, equal opportunity boilerplate, and unreadable line breaks.',
  '4. Output ONLY the formatted Markdown. No preamble.',
].join('\n')

/** Default output-token budget for a single JD normalization. */
export const JD_FORMAT_MAX_TOKENS = 1536

/** Strips a ```markdown … ``` (or bare ```) fence if the model wrapped output. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export interface FormatJdResult {
  /** Clean Markdown (fence-stripped). Empty string when the model returned nothing. */
  markdown: string
  usage: LlmUsage
}

/**
 * Formats one raw job description into clean Markdown via the given provider.
 * Throws LlmError (from the provider client) on an upstream failure so callers
 * can decide whether to fall back to the raw text. Returns fence-stripped text.
 */
export async function formatJdMarkdown(args: {
  provider: LlmProviderId
  model: string
  apiKey: string
  description: string
  maxTokens?: number
}): Promise<FormatJdResult> {
  const provider = getProvider(args.provider)
  const result = await provider.complete(
    {
      model: args.model,
      system: JD_FORMAT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: args.description }],
      maxTokens: args.maxTokens ?? JD_FORMAT_MAX_TOKENS,
    },
    args.apiKey,
  )
  return { markdown: stripCodeFence(result.text), usage: result.usage }
}
