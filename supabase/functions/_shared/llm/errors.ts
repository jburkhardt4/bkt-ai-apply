/**
 * Normalized LLM error taxonomy + provider-agnostic mapping.
 *
 * Every provider client maps its native HTTP error onto an LlmError so the Edge
 * Function returns one consistent shape: { error, code, provider }. Pure module
 * (no Deno, no network) so the mapping stays unit-testable.
 */
import type { LlmProviderId } from './types.ts'

export type LlmErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'context_length'
  | 'content_filter'
  | 'bad_request'
  | 'provider_unavailable'
  | 'unknown'

export class LlmError extends Error {
  readonly code: LlmErrorCode
  readonly status: number
  readonly provider: LlmProviderId

  constructor(params: {
    code: LlmErrorCode
    status: number
    provider: LlmProviderId
    message: string
  }) {
    super(params.message)
    this.name = 'LlmError'
    this.code = params.code
    this.status = params.status
    this.provider = params.provider
  }
}

/** Maps a provider HTTP status (+ optional detail text) to a normalized code. */
export function codeFromHttpStatus(status: number, detail = ''): LlmErrorCode {
  const text = detail.toLowerCase()
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status === 400 || status === 422) {
    if (
      text.includes('context') ||
      text.includes('too long') ||
      text.includes('maximum') ||
      (text.includes('token') && text.includes('limit'))
    ) {
      return 'context_length'
    }
    if (text.includes('safety') || text.includes('content policy') || text.includes('content_filter')) {
      return 'content_filter'
    }
    return 'bad_request'
  }
  if (status >= 500) return 'provider_unavailable'
  return 'unknown'
}

const PROVIDER_LABEL: Record<LlmProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Gemini',
}

/** A safe, user-facing message for a normalized error code. Never leaks keys. */
export function clientMessageForCode(code: LlmErrorCode, provider: LlmProviderId): string {
  const label = PROVIDER_LABEL[provider]
  switch (code) {
    case 'auth':
      return `The ${label} API key is missing or invalid. Add a valid key in Settings → Integrations.`
    case 'rate_limit':
      return `${label} is rate-limiting requests right now. Please try again in a moment.`
    case 'context_length':
      return `This conversation is too long for ${label}. Start a new chat or shorten the request.`
    case 'content_filter':
      return `${label} blocked this request under its content policy.`
    case 'bad_request':
      return `${label} rejected the request as malformed.`
    case 'provider_unavailable':
      return `${label} is temporarily unavailable. Please try again shortly.`
    default:
      return `An unexpected error occurred while calling ${label}.`
  }
}

/** Maps a normalized code to the HTTP status the Edge Function returns. */
export function httpStatusForCode(code: LlmErrorCode): number {
  switch (code) {
    case 'rate_limit':
      return 429
    case 'context_length':
    case 'bad_request':
    case 'content_filter':
      return 400
    // 'auth' here is an UPSTREAM provider-key failure, not the caller's Supabase
    // session — return 502 (bad gateway) so the client never treats it as its
    // own session expiring.
    case 'auth':
    case 'provider_unavailable':
    default:
      return 502
  }
}
