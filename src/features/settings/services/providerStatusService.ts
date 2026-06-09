/**
 * providerStatusService — reads which LLM providers have a key configured.
 *
 * Calls the provider-status Edge Function (booleans only; never key material)
 * through the single Supabase client. Parsing is split out as a pure function
 * so the normalization is unit-testable without the network.
 */
import { getSupabaseClient } from '@/lib/supabase'
import type { ProviderStatusMap } from '../types'

/** Coerces an arbitrary response into a strict, complete status map. */
export function parseProviderStatus(raw: unknown): ProviderStatusMap {
  const record = (raw ?? {}) as Record<string, unknown>
  return {
    anthropic: record.anthropic === true,
    openai: record.openai === true,
    google: record.google === true,
  }
}

export async function fetchProviderStatus(): Promise<ProviderStatusMap> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<Record<string, boolean>>(
    'provider-status',
    { body: {} },
  )
  if (error) throw new Error(error.message)
  return parseProviderStatus(data)
}
