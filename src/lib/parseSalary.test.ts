/**
 * Tests for the parseSalary function used in prospector-cron Edge Function.
 *
 * The function is inlined here (pure logic, no Deno deps) so it runs under
 * Vitest without requiring the Deno runtime.
 */
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Inline copy of parseSalary from supabase/functions/prospector-cron/index.ts
// Keep in sync if the Edge Function implementation changes.
// ---------------------------------------------------------------------------

interface ParsedSalary {
  min: number | null
  max: number | null
}

function parseSalary(salaryStr: string | undefined): ParsedSalary {
  if (!salaryStr) return { min: null, max: null }

  const cleaned = salaryStr.replace(/[$,]/g, '')

  const parseValue = (raw: string): number | null => {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([KkMm]?)/)
    if (!match) return null
    const num = parseFloat(match[1])
    const suffix = match[2].toUpperCase()
    if (suffix === 'K') return Math.round(num * 1_000)
    if (suffix === 'M') return Math.round(num * 1_000_000)
    return Math.round(num)
  }

  const rangeMatch = cleaned.match(
    /^(\d+(?:\.\d+)?[KkMm]?)\s*[–—-]\s*(\d+(?:\.\d+)?[KkMm]?)/
  )
  if (rangeMatch) {
    return { min: parseValue(rangeMatch[1]), max: parseValue(rangeMatch[2]) }
  }

  const singleMatch = cleaned.match(/^(\d+(?:\.\d+)?[KkMm]?)/)
  if (singleMatch) {
    const val = parseValue(singleMatch[1])
    return { min: val, max: val }
  }

  return { min: null, max: null }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSalary', () => {
  describe('K-suffix ranges (primary SerpApi format)', () => {
    it('parses en-dash range: "73K–97K a year"', () => {
      expect(parseSalary('73K–97K a year')).toEqual({ min: 73000, max: 97000 })
    })

    it('parses en-dash range: "77K–138K a year"', () => {
      expect(parseSalary('77K–138K a year')).toEqual({ min: 77000, max: 138000 })
    })

    it('parses hyphen-minus range: "80K-120K a year"', () => {
      expect(parseSalary('80K-120K a year')).toEqual({ min: 80000, max: 120000 })
    })

    it('parses em-dash range: "90K—130K"', () => {
      expect(parseSalary('90K—130K')).toEqual({ min: 90000, max: 130000 })
    })

    it('parses lowercase k: "73k–97k a year"', () => {
      expect(parseSalary('73k–97k a year')).toEqual({ min: 73000, max: 97000 })
    })
  })

  describe('M-suffix (millions)', () => {
    it('parses "1.5M–2M a year"', () => {
      expect(parseSalary('1.5M–2M a year')).toEqual({ min: 1500000, max: 2000000 })
    })
  })

  describe('Bare integer ranges (comma-formatted)', () => {
    it('parses "$73,000–$97,000 a year"', () => {
      expect(parseSalary('$73,000–$97,000 a year')).toEqual({ min: 73000, max: 97000 })
    })

    it('parses bare range without currency: "73000–97000"', () => {
      expect(parseSalary('73000–97000')).toEqual({ min: 73000, max: 97000 })
    })
  })

  describe('Single values', () => {
    it('parses "$100K a year" as min === max', () => {
      expect(parseSalary('$100K a year')).toEqual({ min: 100000, max: 100000 })
    })

    it('parses "$100,000 a year" as min === max', () => {
      expect(parseSalary('$100,000 a year')).toEqual({ min: 100000, max: 100000 })
    })
  })

  describe('Null / unparseable inputs', () => {
    it('returns nulls for undefined', () => {
      expect(parseSalary(undefined)).toEqual({ min: null, max: null })
    })

    it('returns nulls for empty string', () => {
      expect(parseSalary('')).toEqual({ min: null, max: null })
    })

    it('returns nulls for non-numeric string', () => {
      expect(parseSalary('Competitive')).toEqual({ min: null, max: null })
    })

    it('returns nulls for "Not disclosed"', () => {
      expect(parseSalary('Not disclosed')).toEqual({ min: null, max: null })
    })
  })

  describe('Salary filter safety (null !== below-threshold)', () => {
    it('null salary must NOT be treated as 0 (below any threshold)', () => {
      const { min, max } = parseSalary(undefined)
      const hasSalaryData = min != null || max != null
      // hasSalaryData MUST be false → retain the job, do not filter
      expect(hasSalaryData).toBe(false)
    })

    it('salary of 120K is below a 130K threshold → should be discarded', () => {
      const { min, max } = parseSalary('100K–120K a year')
      const minSalary = 130000
      const highestListed = Math.max(
        max != null ? max : -Infinity,
        min != null ? min : -Infinity,
      )
      expect(highestListed).toBe(120000)
      expect(highestListed < minSalary).toBe(true)
    })

    it('salary of 140K is above a 130K threshold → should be retained', () => {
      const { min, max } = parseSalary('100K–140K a year')
      const minSalary = 130000
      const highestListed = Math.max(
        max != null ? max : -Infinity,
        min != null ? min : -Infinity,
      )
      expect(highestListed).toBe(140000)
      expect(highestListed < minSalary).toBe(false)
    })
  })
})
