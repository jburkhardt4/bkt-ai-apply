import { describe, expect, it } from 'vitest'
import { antibotTierForFamily, detectAtsFamily } from './atsFamily.ts'

describe('detectAtsFamily', () => {
  describe('low-tier read-API families', () => {
    it('detects greenhouse boards as low tier', () => {
      expect(detectAtsFamily('https://boards.greenhouse.io/acme/jobs/123')).toEqual({
        family: 'greenhouse',
        antibotTier: 'low',
      })
      expect(detectAtsFamily('https://job-boards.greenhouse.io/acme/jobs/123').family).toBe('greenhouse')
    })

    it('detects lever as low tier', () => {
      expect(detectAtsFamily('https://jobs.lever.co/acme/123')).toEqual({
        family: 'lever',
        antibotTier: 'low',
      })
    })

    it('detects ashby (canonical + subdomains) as low tier', () => {
      expect(detectAtsFamily('https://jobs.ashbyhq.com/acme/123').family).toBe('ashby')
      expect(detectAtsFamily('https://acme.ashbyhq.com/123').family).toBe('ashby')
      expect(detectAtsFamily('https://ashbyhq.com/acme').antibotTier).toBe('low')
    })

    it('detects smartrecruiters hosts as low tier', () => {
      expect(detectAtsFamily('https://jobs.smartrecruiters.com/Acme/123').family).toBe('smartrecruiters')
      expect(detectAtsFamily('https://careers.smartrecruiters.com/Acme/123').family).toBe('smartrecruiters')
      expect(detectAtsFamily('https://api.smartrecruiters.com/v1/x').family).toBe('smartrecruiters')
      expect(detectAtsFamily('https://acme.smartrecruiters.com/123').antibotTier).toBe('low')
    })
  })

  describe('high-tier defended platform', () => {
    it('detects workday (myworkdayjobs + workday.com) as high tier', () => {
      expect(detectAtsFamily('https://acme.wd1.myworkdayjobs.com/en-US/careers/job/123')).toEqual({
        family: 'workday',
        antibotTier: 'high',
      })
      expect(detectAtsFamily('https://impl.workday.com/acme/d/job/123').family).toBe('workday')
    })
  })

  describe('unknown / other', () => {
    it('maps unknown hosts to other/unknown', () => {
      expect(detectAtsFamily('https://careers.example.com/jobs/123')).toEqual({
        family: 'other',
        antibotTier: 'unknown',
      })
    })

    it('does not match lookalike domains', () => {
      expect(detectAtsFamily('https://notashbyhq.co/jobs').family).toBe('other')
      expect(detectAtsFamily('https://smartrecruiters.io/jobs').family).toBe('other')
    })

    it('returns other/unknown for unparseable URLs', () => {
      expect(detectAtsFamily('not-a-url')).toEqual({ family: 'other', antibotTier: 'unknown' })
      expect(detectAtsFamily('')).toEqual({ family: 'other', antibotTier: 'unknown' })
    })
  })

  describe('case-insensitivity', () => {
    it('lowercases the host before matching', () => {
      expect(detectAtsFamily('https://BOARDS.GREENHOUSE.IO/acme/jobs/1').family).toBe('greenhouse')
      expect(detectAtsFamily('https://ACME.MYWORKDAYJOBS.COM/x').family).toBe('workday')
    })
  })
})

describe('antibotTierForFamily', () => {
  it('maps every family to its contract tier', () => {
    expect(antibotTierForFamily('greenhouse')).toBe('low')
    expect(antibotTierForFamily('lever')).toBe('low')
    expect(antibotTierForFamily('ashby')).toBe('low')
    expect(antibotTierForFamily('smartrecruiters')).toBe('low')
    expect(antibotTierForFamily('workday')).toBe('high')
    expect(antibotTierForFamily('other')).toBe('unknown')
  })
})
