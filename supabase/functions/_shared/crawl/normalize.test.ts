import { describe, expect, it } from 'vitest'
import {
  buildPosting,
  classifyRemoteType,
  coerceInterval,
  coercePostedAt,
  decodeEntities,
  epochMsToIso,
  parseSalaryFromText,
  stripHtml,
} from './normalize.ts'

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&lt;p&gt;Hi&amp;Bye&lt;/p&gt;')).toBe('<p>Hi&Bye</p>')
    expect(decodeEntities('Tom&#39;s')).toBe("Tom's")
    expect(decodeEntities('&#x27;x&#x27;')).toBe("'x'")
  })
  it('leaves unknown entities intact', () => {
    expect(decodeEntities('a &bogus; b')).toBe('a &bogus; b')
  })
})

describe('stripHtml', () => {
  it('turns block tags into newlines and decodes entities', () => {
    expect(stripHtml('<p>Hello &amp; welcome</p><p>Line2</p>')).toBe('Hello & welcome\nLine2')
  })
  it('drops script/style and collapses whitespace', () => {
    expect(stripHtml('<div>A<style>x{}</style>  B<script>1</script></div>')).toBe('A B')
  })
  it('returns empty string for nullish input', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })
})

describe('classifyRemoteType', () => {
  it('prefers an explicit hint (hybrid wins over remote)', () => {
    expect(classifyRemoteType('Remote', '', false)).toBe('remote')
    expect(classifyRemoteType('Hybrid', '', true)).toBe('hybrid')
    expect(classifyRemoteType('On-site', '', true)).toBe('onsite')
  })
  it('falls back to text scan, hybrid before remote', () => {
    expect(classifyRemoteType(null, 'This is a hybrid role, some remote', true)).toBe('hybrid')
    expect(classifyRemoteType(null, 'Fully remote position', false)).toBe('remote')
  })
  it('defaults to onsite only when a location exists, else null', () => {
    expect(classifyRemoteType(null, 'Software Engineer', true)).toBe('onsite')
    expect(classifyRemoteType(null, 'Software Engineer', false)).toBeNull()
  })
})

describe('coerceInterval', () => {
  it('maps free-text intervals to the enum', () => {
    expect(coerceInterval('per-year-salary')).toBe('year')
    expect(coerceInterval('per-hour-wage')).toBe('hour')
    expect(coerceInterval('monthly')).toBe('month')
    expect(coerceInterval('')).toBeNull()
    expect(coerceInterval(null)).toBeNull()
  })
})

describe('epochMsToIso / coercePostedAt', () => {
  it('converts valid epoch ms, rejects invalid', () => {
    expect(epochMsToIso(1700000000000)).toBe(new Date(1700000000000).toISOString())
    expect(epochMsToIso(0)).toBeNull()
    expect(epochMsToIso(null)).toBeNull()
    expect(epochMsToIso(Number.NaN)).toBeNull()
  })
  it('accepts ISO strings or epoch ms, rejects junk/empty', () => {
    expect(coercePostedAt('2024-01-15')).toBe(new Date('2024-01-15').toISOString())
    expect(coercePostedAt(1700000000000)).toBe(new Date(1700000000000).toISOString())
    expect(coercePostedAt('')).toBeNull()
    expect(coercePostedAt('not-a-date')).toBeNull()
    expect(coercePostedAt(null)).toBeNull()
  })
})

describe('parseSalaryFromText', () => {
  it('parses plain and K-suffixed ranges', () => {
    expect(parseSalaryFromText('$120,000 - $150,000')).toEqual({
      min: 120000, max: 150000, currency: 'USD', interval: null,
    })
    expect(parseSalaryFromText('$120K – $150K')).toMatchObject({ min: 120000, max: 150000 })
  })
  it('inherits scale when only the first bound is K-suffixed', () => {
    expect(parseSalaryFromText('$120K-150K')).toMatchObject({ min: 120000, max: 150000 })
  })
  it('detects interval and currency keywords', () => {
    expect(parseSalaryFromText('100000 to 130000 USD per year')).toEqual({
      min: 100000, max: 130000, currency: 'USD', interval: 'year',
    })
  })
  it('returns nulls when no range is present', () => {
    expect(parseSalaryFromText('Competitive salary')).toEqual({
      min: null, max: null, currency: null, interval: null,
    })
    expect(parseSalaryFromText(null)).toEqual({ min: null, max: null, currency: null, interval: null })
  })
})

describe('buildPosting', () => {
  it('returns null when identity/title/url is missing', () => {
    const base = { ats_family: 'lever' as const, title: 'X', application_url: 'https://x', external_job_id: '1' }
    expect(buildPosting({ ...base, external_job_id: null })).toBeNull()
    expect(buildPosting({ ...base, title: '  ' })).toBeNull()
    expect(buildPosting({ ...base, application_url: null })).toBeNull()
  })

  it('trims, derives plaintext, classifies, and coerces', () => {
    const p = buildPosting({
      ats_family: 'lever',
      external_job_id: ' 42 ',
      title: '  Senior Engineer  ',
      application_url: 'https://jobs.lever.co/acme/42/apply',
      description_html: '<p>Remote role</p>',
      remote_hint: 'remote',
      location_raw: 'New York, NY',
      salary_min: 100000,
      salary_max: 150000,
      salary_currency: 'USD',
      salary_interval: 'per-year-salary',
      posted_at: 1700000000000,
    })
    expect(p).not.toBeNull()
    expect(p!.external_job_id).toBe('42')
    expect(p!.title).toBe('Senior Engineer')
    expect(p!.description_text).toBe('Remote role')
    expect(p!.remote_type).toBe('remote')
    expect(p!.salary_interval).toBe('year')
    expect(p!.posted_at).toBe(new Date(1700000000000).toISOString())
  })

  it('drops an inconsistent salary range (max < min)', () => {
    const p = buildPosting({
      ats_family: 'ashby',
      external_job_id: '1',
      title: 'X',
      application_url: 'https://x',
      salary_min: 200000,
      salary_max: 100000,
    })
    expect(p!.salary_min).toBeNull()
    expect(p!.salary_max).toBeNull()
  })
})
