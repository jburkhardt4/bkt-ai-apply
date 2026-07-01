/**
 * prospector/guard — pure, side-effect-free SerpApi quota safeguards.
 *
 * Extracted from prospector-cron so the burn-control + stall-detection logic is
 * vitest-testable (LSN-007: edge functions escape `pnpm validate`; keep the real
 * logic in `_shared/**` with no Deno.* / network dependencies). The edge function
 * owns all I/O (fetch, env, DB) and delegates every decision to these helpers.
 *
 * Motivates the 2026-06-17 stall: SerpApi returned HTTP 429 on every request for
 * ~2 weeks (monthly search quota exhausted). The prospector kept firing ~20 calls
 * per run (5 titles × [1 main + 3 ATS board passes]) twice daily plus manual
 * triggers, so nothing throttled the burn and nothing surfaced the failure.
 */

/** Runtime knobs, all overridable via env with safe defaults. */
export interface ProspectorRuntimeConfig {
  /** Run the extra per-title × ATS-host `site:` passes (~4× the SerpApi calls). */
  atsPassesEnabled: boolean
  /** Hard cap on SerpApi calls per invocation — bounds burn regardless of titles. */
  maxSerpApiCallsPerRun: number
  /** Min minutes between runs; a run inside this window is skipped unless forced. 0 disables. */
  minRunIntervalMinutes: number
  /** Alert when no job has been queued in this many hours. */
  staleFeedHours: number
}

const DEFAULTS: ProspectorRuntimeConfig = {
  atsPassesEnabled: true,
  maxSerpApiCallsPerRun: 40,
  minRunIntervalMinutes: 30,
  staleFeedHours: 48,
}

const OFF_VALUES = new Set(['false', 'off', '0', 'no'])

function parseIntOr(raw: string | undefined, fallback: number, min: number): number {
  if (raw == null) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= min ? n : fallback
}

/** Reads config from an env map (dependency-injected so it stays pure/testable). */
export function readProspectorRuntimeConfig(
  env: Record<string, string | undefined>,
): ProspectorRuntimeConfig {
  const atsRaw = env.PROSPECTOR_ATS_PASSES
  return {
    atsPassesEnabled: atsRaw == null ? DEFAULTS.atsPassesEnabled : !OFF_VALUES.has(atsRaw.toLowerCase()),
    maxSerpApiCallsPerRun: parseIntOr(env.PROSPECTOR_MAX_SERPAPI_CALLS, DEFAULTS.maxSerpApiCallsPerRun, 1),
    minRunIntervalMinutes: parseIntOr(env.PROSPECTOR_MIN_RUN_INTERVAL_MIN, DEFAULTS.minRunIntervalMinutes, 0),
    staleFeedHours: parseIntOr(env.PROSPECTOR_STALE_FEED_HOURS, DEFAULTS.staleFeedHours, 1),
  }
}

/** Marker error for a confirmed SerpApi 429 (quota/rate-limit) so the guard can trip. */
export class RateLimitError extends Error {
  constructor(message = 'SerpApi rate limit') {
    super(message)
    this.name = 'RateLimitError'
  }
}

export type SerpApiSkipReason = 'budget' | 'rate_limited'

/**
 * Per-invocation SerpApi budget + 429 circuit breaker.
 *
 * `check()` before every call; once the breaker trips (a call confirmed a 429) or
 * the per-run budget is spent, all further calls are denied — so a quota-exhausted
 * account wastes at most one retry cycle instead of 20+ per run.
 */
export class SerpApiGuard {
  private readonly max: number
  private calls = 0
  private tripped = false

  constructor(maxCalls: number) {
    this.max = maxCalls
  }

  check(): { allowed: boolean; reason?: SerpApiSkipReason } {
    if (this.tripped) return { allowed: false, reason: 'rate_limited' }
    if (this.calls >= this.max) return { allowed: false, reason: 'budget' }
    return { allowed: true }
  }

  recordCall(): void {
    this.calls += 1
  }

  tripRateLimit(): void {
    this.tripped = true
  }

  get callsMade(): number {
    return this.calls
  }

  get rateLimited(): boolean {
    return this.tripped
  }
}

/** True when a run started within `minIntervalMinutes` of the last one (run-frequency limit). */
export function shouldThrottleRun(
  lastRunAt: string | null,
  now: Date,
  minIntervalMinutes: number,
  force: boolean,
): boolean {
  if (force || minIntervalMinutes <= 0 || !lastRunAt) return false
  const last = new Date(lastRunAt).getTime()
  if (Number.isNaN(last)) return false
  return (now.getTime() - last) / 60_000 < minIntervalMinutes
}

/** True when the feed has queued no jobs within `staleHours` (never-queued counts as stale). */
export function isFeedStale(lastQueuedAt: string | null, now: Date, staleHours: number): boolean {
  if (!lastQueuedAt) return true
  const last = new Date(lastQueuedAt).getTime()
  if (Number.isNaN(last)) return true
  return (now.getTime() - last) / 3_600_000 > staleHours
}

/** Per-profile outcome the alert planner needs (subset of the run result). */
export interface ProfileRunSummary {
  profileId: string
  userId: string
  status: 'success' | 'empty' | 'partial' | 'error'
  /** Whether the profile has any job_titles — a title-less profile can never produce jobs. */
  hasTitles: boolean
}

/** A user-facing alert to raise for a stalled/failing feed. */
export interface FeedAlert {
  userId: string
  kind: 'error' | 'stale'
  title: string
  body: string
}

/**
 * Decides which silent-failure alerts to raise from a run (pure). One `error`
 * alert per owner of an errored profile; one `stale` alert per title-holding
 * owner NOT already covered by an error alert (error is more specific, and a
 * stalled feed is usually a downstream symptom of the same rate limit).
 * Owners with no job_titles are never alerted — they have nothing configured.
 */
export function planFeedAlerts(
  results: ProfileRunSummary[],
  feedStale: boolean,
  staleHours: number,
): FeedAlert[] {
  const alerts: FeedAlert[] = []
  const erroredUsers = new Set<string>()

  for (const r of results) {
    if (r.status === 'error' && !erroredUsers.has(r.userId)) {
      erroredUsers.add(r.userId)
      alerts.push({
        userId: r.userId,
        kind: 'error',
        title: 'Job search feed error',
        body: 'One or more job searches failed this run (commonly a SerpApi rate limit / exhausted quota). New jobs are not being added until this clears.',
      })
    }
  }

  if (feedStale) {
    const staleUsers = new Set<string>()
    for (const r of results) {
      if (r.hasTitles && !erroredUsers.has(r.userId) && !staleUsers.has(r.userId)) {
        staleUsers.add(r.userId)
        alerts.push({
          userId: r.userId,
          kind: 'stale',
          title: 'Job search feed stalled',
          body: `No new jobs have been added in over ${staleHours} hours — the discovery feed has stalled. Check the SerpApi quota/plan.`,
        })
      }
    }
  }

  return alerts
}
