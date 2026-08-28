/**
 * Tests for summarizeRunResults — the pure classifier that turns a
 * prospector-cron response body into a single user-facing toast outcome.
 *
 * Pure logic, no DOM: runs under the default Vitest (node) environment, mirroring
 * the parseSalary.test.ts pattern. Covers the task-1 precedence rules:
 *   error > empty > success, jobs_queued summation, and the partial soft note.
 */
import { describe, expect, it } from 'vitest'
import { summarizeRunResults } from './summarizeRunResults'

describe('summarizeRunResults', () => {
  it('returns empty when data is null', () => {
    expect(summarizeRunResults(null)).toEqual({
      kind: 'empty',
      message: 'No new jobs found',
    })
  })

  it('returns empty when there are no results', () => {
    expect(summarizeRunResults({ results: [] }).kind).toBe('empty')
    expect(summarizeRunResults({ message: 'x', profiles_processed: 0 }).kind).toBe('empty')
  })

  it('returns empty when every result is empty', () => {
    const outcome = summarizeRunResults({
      results: [
        { profile_id: 'a', status: 'empty', jobs_found: 0, jobs_queued: 0 },
        { profile_id: 'b', status: 'empty', jobs_found: 0, jobs_queued: 0 },
      ],
    })
    expect(outcome.kind).toBe('empty')
    expect(outcome.message).toBe('No new jobs found')
  })

  it('returns error when any result has status error (takes precedence)', () => {
    const outcome = summarizeRunResults({
      results: [
        { profile_id: 'a', status: 'success', jobs_found: 5, jobs_queued: 5 },
        { profile_id: 'b', status: 'error', jobs_found: 0, jobs_queued: 0 },
      ],
    })
    expect(outcome.kind).toBe('error')
  })

  it('sums jobs_queued across results on success', () => {
    const outcome = summarizeRunResults({
      results: [
        { profile_id: 'a', status: 'success', jobs_found: 10, jobs_queued: 3 },
        { profile_id: 'b', status: 'success', jobs_found: 8, jobs_queued: 4 },
      ],
    })
    expect(outcome.kind).toBe('success')
    expect(outcome.message).toBe('Added 7 new jobs')
  })

  it('uses singular phrasing for exactly one queued job', () => {
    const outcome = summarizeRunResults({
      results: [{ profile_id: 'a', status: 'success', jobs_found: 4, jobs_queued: 1 }],
    })
    expect(outcome.message).toBe('Added 1 new job')
  })

  it('appends a soft note when a result is partial', () => {
    const outcome = summarizeRunResults({
      results: [
        { profile_id: 'a', status: 'partial', jobs_found: 6, jobs_queued: 2 },
        { profile_id: 'b', status: 'empty', jobs_found: 0, jobs_queued: 0 },
      ],
    })
    expect(outcome.kind).toBe('success')
    expect(outcome.message).toBe('Added 2 new jobs (some searches were incomplete)')
  })

  it('treats a partial-only run with zero queued as success with note (not empty)', () => {
    // partial is not empty, so the empty branch must not swallow it.
    const outcome = summarizeRunResults({
      results: [{ profile_id: 'a', status: 'partial', jobs_found: 0, jobs_queued: 0 }],
    })
    expect(outcome.kind).toBe('success')
    expect(outcome.message).toBe('Added 0 new jobs (some searches were incomplete)')
  })

  it('returns a throttled outcome (not empty) when the run was throttled', () => {
    const outcome = summarizeRunResults({ throttled: true, min_run_interval_minutes: 30 })
    expect(outcome.kind).toBe('throttled')
    expect(outcome.message).toBe(
      'You searched recently — searches run at most once every 30 minutes. Try again shortly.',
    )
  })

  it('throttled takes precedence over the empty branch (no results present)', () => {
    // A throttled response carries no results; the empty branch must not swallow it.
    expect(summarizeRunResults({ throttled: true, results: [] }).kind).toBe('throttled')
  })

  it('falls back to a generic throttled message when the interval is unknown', () => {
    const outcome = summarizeRunResults({ throttled: true })
    expect(outcome.kind).toBe('throttled')
    expect(outcome.message).toBe('You searched recently — try again in a few minutes.')
  })
})
