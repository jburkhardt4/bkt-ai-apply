import { describe, expect, it } from 'vitest'
import { detectAtsVendor, resolveChannel } from './resolveChannel.ts'

describe('detectAtsVendor', () => {
  describe('Greenhouse vendor detection', () => {
    it('detects boards.greenhouse.io', () => {
      expect(detectAtsVendor('https://boards.greenhouse.io/acme/jobs/123')).toBe('greenhouse')
    })

    it('detects job-boards.greenhouse.io', () => {
      expect(detectAtsVendor('https://job-boards.greenhouse.io/acme/jobs/123')).toBe('greenhouse')
    })

    it('handles case-insensitivity', () => {
      expect(detectAtsVendor('https://BOARDS.GREENHOUSE.IO/acme/jobs/123')).toBe('greenhouse')
      expect(detectAtsVendor('https://Job-Boards.Greenhouse.IO/acme/jobs/123')).toBe('greenhouse')
    })

    it('requires exact host match (rejects subdomains other than job-boards)', () => {
      expect(detectAtsVendor('https://custom.boards.greenhouse.io/acme/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://careers.greenhouse.io/acme/jobs/123')).toBeNull()
    })
  })

  describe('Lever vendor detection', () => {
    it('detects jobs.lever.co', () => {
      expect(detectAtsVendor('https://jobs.lever.co/acme/jobs/123')).toBe('lever')
    })

    it('handles case-insensitivity', () => {
      expect(detectAtsVendor('https://JOBS.LEVER.CO/acme/jobs/123')).toBe('lever')
      expect(detectAtsVendor('https://Jobs.Lever.Co/acme/jobs/123')).toBe('lever')
    })

    it('requires exact host match (rejects subdomains)', () => {
      expect(detectAtsVendor('https://custom.jobs.lever.co/acme/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://careers.lever.co/acme/jobs/123')).toBeNull()
    })
  })

  describe('Ashby vendor detection', () => {
    it('detects jobs.ashbyhq.com', () => {
      expect(detectAtsVendor('https://jobs.ashbyhq.com/acme/jobs/123')).toBe('ashby')
    })

    it('detects ashbyhq.com without subdomain', () => {
      expect(detectAtsVendor('https://ashbyhq.com/acme/jobs/123')).toBe('ashby')
    })

    it('detects custom *.ashbyhq.com subdomains', () => {
      expect(detectAtsVendor('https://acme.ashbyhq.com/jobs/123')).toBe('ashby')
      expect(detectAtsVendor('https://careers.ashbyhq.com/jobs/123')).toBe('ashby')
      expect(detectAtsVendor('https://custom-subdomain.ashbyhq.com/jobs/123')).toBe('ashby')
    })

    it('handles case-insensitivity for ashby subdomains', () => {
      expect(detectAtsVendor('https://JOBS.ASHBYHQ.COM/acme/jobs/123')).toBe('ashby')
      expect(detectAtsVendor('https://ACME.ASHBYHQ.COM/jobs/123')).toBe('ashby')
      expect(detectAtsVendor('https://ASHBYHQ.COM/jobs/123')).toBe('ashby')
    })

    it('does not detect unrelated ashbyhq.com-like domains', () => {
      expect(detectAtsVendor('https://notashbyhq.com/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://ashbyhq.co/jobs/123')).toBeNull()
    })
  })

  describe('Unknown vendors', () => {
    it('returns null for unknown hosts', () => {
      expect(detectAtsVendor('https://careers.example.com/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://apply.companyname.io/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://custom-ats.local/jobs/123')).toBeNull()
    })

    it('returns null for hosts that look like ATS but are not supported', () => {
      expect(detectAtsVendor('https://workable.com/jobs/123')).toBeNull()
      expect(detectAtsVendor('https://talentgarden.io/jobs/123')).toBeNull()
    })
  })

  describe('Malformed URLs', () => {
    it('returns null for unparseable URLs', () => {
      expect(detectAtsVendor('not-a-url')).toBeNull()
      expect(detectAtsVendor('htp://typo.com')).toBeNull()
      expect(detectAtsVendor('://invalid.com')).toBeNull()
      expect(detectAtsVendor('')).toBeNull()
    })

    it('returns null for URLs without a valid host', () => {
      expect(detectAtsVendor('file:///path/to/file')).toBeNull()
      expect(detectAtsVendor('mailto:test@example.com')).toBeNull()
    })

    it('handles URLs with standard HTTPS ports and query parameters gracefully', () => {
      // Standard HTTPS port (443) is omitted from the host property
      expect(detectAtsVendor('https://boards.greenhouse.io:443/acme/jobs/123?ref=google')).toBe(
        'greenhouse',
      )
      expect(detectAtsVendor('https://acme.ashbyhq.com:443/jobs/123#section')).toBe('ashby')
    })

    it('returns null for URLs with non-standard ports (ports are included in host)', () => {
      // Non-standard ports become part of the host (e.g., "jobs.lever.co:8080")
      // which will not match the exact host checks
      expect(detectAtsVendor('https://jobs.lever.co:8080/acme/jobs?source=linkedin')).toBeNull()
    })

    it('handles URLs with authentication info gracefully', () => {
      // User info is stripped by URL parser, host is extracted correctly
      expect(detectAtsVendor('https://user@jobs.lever.co/acme/jobs/123')).toBe('lever')
      expect(detectAtsVendor('https://password@boards.greenhouse.io/jobs/123')).toBe('greenhouse')
    })
  })

  describe('Edge cases', () => {
    it('handles URLs with trailing slashes', () => {
      expect(detectAtsVendor('https://boards.greenhouse.io/')).toBe('greenhouse')
      expect(detectAtsVendor('https://jobs.lever.co/')).toBe('lever')
      expect(detectAtsVendor('https://ashbyhq.com/')).toBe('ashby')
    })

    it('handles URLs with multiple subdomains for ashby', () => {
      expect(detectAtsVendor('https://multi.level.subdomain.ashbyhq.com/jobs/123')).toBe('ashby')
    })
  })
})

describe('resolveChannel', () => {
  describe('API method routing', () => {
    it('resolves to api channel with greenhouse vendor', () => {
      const result = resolveChannel('api', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('api')
      expect(result.vendor).toBe('greenhouse')
    })

    it('resolves to api channel with lever vendor', () => {
      const result = resolveChannel('api', 'https://jobs.lever.co/acme/jobs/123')
      expect(result.channel).toBe('api')
      expect(result.vendor).toBe('lever')
    })

    it('resolves to api channel with ashby vendor', () => {
      const result = resolveChannel('api', 'https://acme.ashbyhq.com/jobs/123')
      expect(result.channel).toBe('api')
      expect(result.vendor).toBe('ashby')
    })

    it('falls back to browser channel when api method has unknown host', () => {
      const result = resolveChannel('api', 'https://careers.example.com/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('handles case-insensitive api method', () => {
      const resultLower = resolveChannel('api', 'https://boards.greenhouse.io/acme/jobs/123')
      const resultUpper = resolveChannel('API', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(resultLower).toEqual(resultUpper)
    })
  })

  describe('ATS method routing', () => {
    it('resolves to ats channel with known vendor', () => {
      const result = resolveChannel('ats', 'https://jobs.lever.co/acme/jobs/123')
      expect(result.channel).toBe('ats')
      expect(result.vendor).toBe('lever')
    })

    it('falls back to browser channel when ats method has unknown host', () => {
      const result = resolveChannel('ats', 'https://unknown-ats.com/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('handles case-insensitive ats method', () => {
      const resultLower = resolveChannel('ats', 'https://jobs.lever.co/acme/jobs/123')
      const resultUpper = resolveChannel('ATS', 'https://jobs.lever.co/acme/jobs/123')
      expect(resultLower).toEqual(resultUpper)
    })
  })

  describe('Manual method routing', () => {
    it('resolves to browser channel for manual method', () => {
      const result = resolveChannel('manual', 'https://any-url.com')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('handles case-insensitive manual method', () => {
      const resultLower = resolveChannel('manual', 'https://any-url.com')
      const resultUpper = resolveChannel('MANUAL', 'https://any-url.com')
      expect(resultLower).toEqual(resultUpper)
    })

    it('ignores source URL for manual method even if it is a known vendor', () => {
      const result = resolveChannel('manual', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })
  })

  describe('Null and unknown application methods', () => {
    it('resolves null method to browser channel', () => {
      const result = resolveChannel(null, 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('resolves unknown method to browser channel', () => {
      const result = resolveChannel('unknown', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('resolves empty string method to browser channel', () => {
      const result = resolveChannel('', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('resolves whitespace-only method to browser channel', () => {
      const result = resolveChannel('   ', 'https://boards.greenhouse.io/acme/jobs/123')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })
  })

  describe('Complex URLs with api/ats methods', () => {
    it('handles malformed URLs with api method', () => {
      const result = resolveChannel('api', 'not-a-url')
      expect(result.channel).toBe('browser')
      expect(result.vendor).toBeNull()
    })

    it('handles URLs with query parameters and fragments', () => {
      const result = resolveChannel('api', 'https://jobs.lever.co/acme/jobs/123?ref=google&src=linkedin#details')
      expect(result.channel).toBe('api')
      expect(result.vendor).toBe('lever')
    })
  })

  describe('All vendors with all methods', () => {
    const vendors = [
      { url: 'https://boards.greenhouse.io/acme/jobs/123', expected: 'greenhouse' },
      { url: 'https://jobs.lever.co/acme/jobs/123', expected: 'lever' },
      { url: 'https://acme.ashbyhq.com/jobs/123', expected: 'ashby' },
    ]

    const methods = ['api', 'ats']

    vendors.forEach(({ url, expected }) => {
      methods.forEach((method) => {
        it(`resolves ${method} method with ${expected} vendor`, () => {
          const result = resolveChannel(method, url)
          expect(result.channel).toBe(method)
          expect(result.vendor).toBe(expected)
        })
      })
    })
  })
})
