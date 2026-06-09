import type { AiModelProvider } from '@/types/pipeline'

/** Per-provider configured/not-configured flags from the provider-status fn. */
export type ProviderStatusMap = Record<AiModelProvider, boolean>

export interface ProviderMeta {
  id: AiModelProvider
  name: string
  description: string
  /** Where the user creates/rotates the key (the secret lives in Supabase). */
  docsUrl: string
  /** The Supabase Edge Function secret name backing this provider. */
  envVar: string
}
