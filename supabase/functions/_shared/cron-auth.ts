/**
 * Shared scheduler/caller authentication for `--no-verify-jwt` Edge Functions.
 *
 * Generalizes the CRON_SECRET gate that previously lived only in
 * submission-worker, so prospector-cron and gmail-sync enforce the same control
 * (closes the "publicly invokable cron" findings). The mechanism, not a per-
 * function copy: each handler composes `hasValidCronSecret` (scheduler path)
 * with `getAuthenticatedUserId` (user/JWT path) as appropriate.
 *
 * Back-compat: callers treat an UNSET CRON_SECRET as "not yet provisioned"
 * (warn, allow) so deploying this does not break a running cron before the
 * secret is configured; once set, it is enforced (fail closed).
 */

/**
 * Constant-time string equality. Both inputs are SHA-256 digested to fixed
 * 32-byte buffers first, then compared with a branchless XOR fold, so neither
 * the comparison time nor the loop length reveals anything about the secret
 * (including its length). `crypto.subtle` is available in the Deno edge runtime
 * and in Node's webcrypto (so this stays unit-testable under vitest).
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const av = new Uint8Array(ah)
  const bv = new Uint8Array(bh)
  let diff = 0
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i]
  return diff === 0
}

/** True when CRON_SECRET is configured for this function's environment. */
export function cronSecretConfigured(): boolean {
  return !!Deno.env.get('CRON_SECRET')
}

/**
 * True when the request carries the correct CRON_SECRET, supplied via either
 * the `x-cron-secret` header or `Authorization: Bearer <CRON_SECRET>`.
 * Returns false when CRON_SECRET is unset — callers decide the unset behavior
 * (see `cronSecretConfigured`).
 */
export async function hasValidCronSecret(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return false

  const headerSecret = req.headers.get('x-cron-secret')
  if (headerSecret && (await timingSafeEqual(headerSecret, secret))) return true

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (authHeader && (await timingSafeEqual(authHeader, `Bearer ${secret}`))) return true

  return false
}
