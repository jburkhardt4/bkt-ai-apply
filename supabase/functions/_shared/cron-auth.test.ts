import { describe, expect, it } from 'vitest'
import { timingSafeEqual } from './cron-auth.ts'

// timingSafeEqual is the pure half of the shared cron gate. The Deno.env-backed
// helpers (hasValidCronSecret / cronSecretConfigured) are exercised in the Edge
// runtime; here we pin the comparison primitive every gate relies on.
describe('timingSafeEqual', () => {
  it('returns true for identical secrets', async () => {
    expect(await timingSafeEqual('s3cret-abc-123', 's3cret-abc-123')).toBe(true)
  })

  it('returns false for different same-length secrets', async () => {
    expect(await timingSafeEqual('s3cret-abc-123', 's3cret-abc-124')).toBe(false)
  })

  it('returns false for different-length values', async () => {
    expect(await timingSafeEqual('short', 'a-much-longer-secret-value')).toBe(false)
  })

  it('returns false when one side is empty', async () => {
    expect(await timingSafeEqual('', 'nonempty')).toBe(false)
    expect(await timingSafeEqual('nonempty', '')).toBe(false)
  })

  it('returns true for two empty strings', async () => {
    expect(await timingSafeEqual('', '')).toBe(true)
  })
})
