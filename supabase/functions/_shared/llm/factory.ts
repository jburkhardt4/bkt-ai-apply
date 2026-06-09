/**
 * Provider factory + key resolution.
 *
 * Single source of truth for (a) which env var holds each provider's key and
 * (b) how to obtain a provider client. Keys are project-level Supabase Edge
 * Function secrets read from Deno.env at runtime — they never reach the client
 * bundle (ADR-005). The first non-empty env var in precedence order wins, with
 * legacy fallbacks for a clean migration.
 */
import type { LlmProvider, LlmProviderId } from './types.ts'
import { anthropicProvider } from './anthropic.ts'
import { openaiProvider } from './openai.ts'
import { googleProvider } from './google.ts'

export const PROVIDER_IDS: LlmProviderId[] = ['anthropic', 'openai', 'google']

const PROVIDERS: Record<LlmProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
}

const ENV_VARS_BY_PROVIDER: Record<LlmProviderId, string[]> = {
  anthropic: ['ANTHROPIC_KEY', 'ANTHROPIC_API_KEY'],
  openai: ['OPENAI_KEY', 'OPENAI_API_KEY'],
  google: ['GEMINI_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
}

export function isProviderId(value: unknown): value is LlmProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'google'
}

export function getProvider(id: LlmProviderId): LlmProvider {
  return PROVIDERS[id]
}

export function getApiKeyForProvider(id: LlmProviderId): string | null {
  for (const name of ENV_VARS_BY_PROVIDER[id]) {
    const value = Deno.env.get(name)
    if (value && value.trim().length > 0) return value.trim()
  }
  return null
}

export function isProviderConfigured(id: LlmProviderId): boolean {
  return getApiKeyForProvider(id) !== null
}
