import { describe, it, expect } from 'vitest'
import {
  readProspectorRuntimeConfig,
  SerpApiGuard,
  RateLimitError,
  shouldThrottleRun,
  isFeedStale,
  planFeedAlerts,
  type ProfileRunSummary,
} from './guard.ts'

describe('readProspectorRuntimeConfig', () => {
  it('returns safe defaults when env is empty', () => {
    expect(readProspectorRuntimeConfig({})).toEqual({
      atsPassesEnabled: true,
      maxSerpApiCallsPerRun: 40,
      minRunIntervalMinutes: 30,
      staleFeedHours: 48,
    })
  })

  it('disables ATS passes only for explicit off values', () => {
    for (const off of ['false', 'FALSE', 'off', '0', 'no']) {
      expect(readProspectorRuntimeConfig({ PROSPECTOR_ATS_PASSES: off }).atsPassesEnabled).toBe(false)
    }
    for (const on of ['true', '1', 'on', undefined]) {
      expect(readProspectorRuntimeConfig({ PROSPECTOR_ATS_PASSES: on }).atsPassesEnabled).toBe(true)
    }
  })

  it('parses numeric overrides and falls back to defaults on garbage', () => {
    expect(readProspectorRuntimeConfig({ PROSPECTOR_MAX_SERPAPI_CALLS: '10' }).maxSerpApiCallsPerRun).toBe(10)
    expect(readProspectorRuntimeConfig({ PROSPECTOR_MAX_SERPAPI_CALLS: 'abc' }).maxSerpApiCallsPerRun).toBe(40)
    expect(readProspectorRuntimeConfig({ PROSPECTOR_MAX_SERPAPI_CALLS: '0' }).maxSerpApiCallsPerRun).toBe(40)
    // minRunIntervalMinutes allows 0 (disables throttle) but rejects negatives/garbage
    expect(readProspectorRuntimeConfig({ PROSPECTOR_MIN_RUN_INTERVAL_MIN: '0' }).minRunIntervalMinutes).toBe(0)
    expect(readProspectorRuntimeConfig({ PROSPECTOR_MIN_RUN_INTERVAL_MIN: '-5' }).minRunIntervalMinutes).toBe(30)
    expect(readProspectorRuntimeConfig({ PROSPECTOR_STALE_FEED_HOURS: '24' }).staleFeedHours).toBe(24)
  })
})

describe('SerpApiGuard', () => {
  it('allows calls until the per-run budget is exhausted', () => {
    const g = new SerpApiGuard(2)
    expect(g.check().allowed).toBe(true)
    g.recordCall()
    expect(g.check().allowed).toBe(true)
    g.recordCall()
    const denied = g.check()
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toBe('budget')
    expect(g.callsMade).toBe(2)
  })

  it('trips the breaker so all further calls are skipped after a rate limit', () => {
    const g = new SerpApiGuard(100)
    g.recordCall()
    g.tripRateLimit()
    const denied = g.check()
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toBe('rate_limited')
    expect(g.rateLimited).toBe(true)
  })

  it('reports rate_limited with precedence over remaining budget', () => {
    const g = new SerpApiGuard(100)
    g.tripRateLimit()
    expect(g.check().reason).toBe('rate_limited')
  })
})

describe('RateLimitError', () => {
  it('is an Error subclass identifiable by name', () => {
    const err = new RateLimitError('quota exhausted')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RateLimitError')
  })
})

describe('shouldThrottleRun', () => {
  const now = new Date('2026-06-30T18:00:00Z')

  it('does not throttle when there is no prior run', () => {
    expect(shouldThrottleRun(null, now, 30, false)).toBe(false)
  })

  it('throttles when the last run is within the interval', () => {
    expect(shouldThrottleRun('2026-06-30T17:50:00Z', now, 30, false)).toBe(true)
  })

  it('does not throttle when the last run is older than the interval', () => {
    expect(shouldThrottleRun('2026-06-30T17:20:00Z', now, 30, false)).toBe(false)
  })

  it('never throttles when forced', () => {
    expect(shouldThrottleRun('2026-06-30T17:59:00Z', now, 30, true)).toBe(false)
  })

  it('never throttles when the interval is 0', () => {
    expect(shouldThrottleRun('2026-06-30T17:59:00Z', now, 0, false)).toBe(false)
  })
})

describe('isFeedStale', () => {
  const now = new Date('2026-06-30T18:00:00Z')

  it('is stale when the feed has never queued a job', () => {
    expect(isFeedStale(null, now, 48)).toBe(true)
  })

  it('is stale when the last queued job is older than the threshold', () => {
    expect(isFeedStale('2026-06-28T10:00:00Z', now, 48)).toBe(true)
  })

  it('is not stale when a job was queued within the threshold', () => {
    expect(isFeedStale('2026-06-30T08:00:00Z', now, 48)).toBe(false)
  })
})

describe('planFeedAlerts', () => {
  const row = (over: Partial<ProfileRunSummary>): ProfileRunSummary => ({
    profileId: 'p', userId: 'u', status: 'success', hasTitles: true, ...over,
  })

  it('emits nothing when the feed is healthy', () => {
    expect(planFeedAlerts([row({ status: 'success' })], false, 48)).toEqual([])
  })

  it('emits one error alert per errored profile owner', () => {
    const alerts = planFeedAlerts(
      [row({ profileId: 'p1', userId: 'u1', status: 'error' }),
       row({ profileId: 'p2', userId: 'u2', status: 'empty' })],
      false, 48,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ userId: 'u1', kind: 'error' })
  })

  it('dedupes multiple errored profiles for the same user into one alert', () => {
    const alerts = planFeedAlerts(
      [row({ profileId: 'p1', userId: 'u1', status: 'error' }),
       row({ profileId: 'p2', userId: 'u1', status: 'error' })],
      false, 48,
    )
    expect(alerts.filter((a) => a.kind === 'error')).toHaveLength(1)
  })

  it('emits stale alerts only to title-holding owners not already errored', () => {
    const alerts = planFeedAlerts(
      [row({ profileId: 'p1', userId: 'u1', status: 'empty' }),
       row({ profileId: 'p2', userId: 'u2', status: 'error' })],
      true, 48,
    )
    // u1 → stale; u2 → error (not also stale, error is more specific)
    expect(alerts).toContainEqual(expect.objectContaining({ userId: 'u1', kind: 'stale' }))
    expect(alerts).toContainEqual(expect.objectContaining({ userId: 'u2', kind: 'error' }))
    expect(alerts.filter((a) => a.userId === 'u2' && a.kind === 'stale')).toHaveLength(0)
  })

  it('never emits stale alerts to owners without titles', () => {
    expect(planFeedAlerts([row({ userId: 'u1', status: 'empty', hasTitles: false })], true, 48)).toEqual([])
  })
})
