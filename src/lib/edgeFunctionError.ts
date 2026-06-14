// BKT AI-Apply — Edge Function error reader.
//
// supabase.functions.invoke() rejects a non-2xx response with a
// FunctionsHttpError whose `.message` is the generic, useless string
// "Edge Function returned a non-2xx status code". The actionable payload our
// functions return — `{ error, code, provider }` (see _shared/llm/errors.ts) —
// lives UNREAD on `error.context` (the raw Response). This reader pulls that
// real message out so the UI shows e.g. "The Anthropic API key is missing or
// invalid…" instead of the cryptic transport string.
//
// Duck-typed (no `instanceof FunctionsHttpError`) so it survives bundle
// boundaries and a missing global Response in tests.

const GENERIC_HTTP_ERROR = 'Edge Function returned a non-2xx status code'

const DEFAULT_FALLBACK = 'The AI service is temporarily unavailable. Please try again in a moment.'

/**
 * Resolves the most useful human-readable message from a Supabase
 * functions.invoke() error. Reads the JSON body off `error.context` (the
 * Response) when present; otherwise falls back to the error message, and
 * finally to a friendly default — never the bare "non-2xx" transport string.
 */
export async function readEdgeFunctionError(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): Promise<string> {
  const context = (error as { context?: unknown } | null | undefined)?.context
  const maybeResponse = context as { json?: unknown; clone?: unknown } | undefined
  if (maybeResponse && typeof maybeResponse.json === 'function') {
    try {
      const source =
        typeof maybeResponse.clone === 'function'
          ? (maybeResponse as Response).clone()
          : (maybeResponse as Response)
      const body = (await source.json()) as { error?: unknown; message?: unknown } | null
      const message =
        typeof body?.error === 'string'
          ? body.error
          : typeof body?.message === 'string'
            ? body.message
            : ''
      if (message.trim().length > 0) return message.trim()
    } catch {
      // Body was not JSON (or already consumed) — fall through to the message.
    }
  }

  if (error instanceof Error && error.message && error.message !== GENERIC_HTTP_ERROR) {
    return error.message
  }

  return fallback
}
