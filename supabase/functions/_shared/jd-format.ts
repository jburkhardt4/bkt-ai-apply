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
  'You are a meticulous formatter for a premium professional job board. You REFORMAT a raw, messy job description into clean, consistently structured Markdown.',
  'You are NOT a summarizer: preserve every substantive detail of the role. Never shorten, condense, paraphrase away, merge, or drop responsibilities, qualifications, skills, or specifics. Light rewording is allowed ONLY to repair broken line breaks and grammar.',
  '',
  'Organize ALL role content under these exact `###` headers, in this order, and include a header ONLY when there is real content for it:',
  '### Description',
  '### Responsibilities',
  '### Qualifications',
  '### Skills',
  '### Certifications',
  '### Benefits',
  '',
  'Map the source’s varied section names into that fixed set:',
  '- "About the Role" / "Overview" / "Summary" / "The Opportunity" / opening prose -> Description',
  '- "Duties" / "Key Responsibilities" / "Day to day" / "What you will do" -> Responsibilities',
  '- "Requirements" / "Minimum or Preferred Qualifications" / "What you bring" / "Experience" -> Qualifications',
  '- "Technical Skills" / "Tools" / "Technologies" / "Competencies" -> Skills',
  '- "Licenses" / "Credentials" -> Certifications',
  '- "Perks" / "What we offer" / "Compensation" -> Benefits',
  '',
  'Formatting rules:',
  '1. Description: 1-3 short paragraphs of prose (no bullets).',
  '2. Responsibilities and Qualifications: `*` bullet points, one distinct point per line, preserving ALL points from the source.',
  '3. Skills and Certifications: SHORT `*` bullets - exactly one skill, tool, or credential per line (e.g. `* Salesforce`, `* Project Management`), never full sentences. Pull them from anywhere in the source.',
  '4. Remove ONLY non-role boilerplate: equal-opportunity and diversity statements, legal disclaimers, application instructions, recruiter contact details, and company marketing fluff. Never remove actual role content.',
  '5. Use `**bold**` only for terms the source itself emphasized. Do not invent or add information.',
  '6. Output ONLY the formatted Markdown - no preamble, no commentary, no code fences.',
].join('\n')

/** Default output-token budget for a single JD normalization. Sized so a fully
 *  reformatted (not summarized) description rarely truncates mid-section. */
export const JD_FORMAT_MAX_TOKENS = 2048

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
