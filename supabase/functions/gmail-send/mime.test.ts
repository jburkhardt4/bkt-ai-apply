import { describe, expect, it } from 'vitest'
import {
  buildMimeMessage,
  buildRawMessage,
  encodeBase64Url,
  encodeHeaderValue,
  forwardSubject,
  replySubject,
} from './mime.ts'

describe('buildMimeMessage', () => {
  it('builds CRLF-separated headers with a plain-text body', () => {
    const mime = buildMimeMessage({
      from: 'john@bktadvisory.com',
      to: 'recruiter@acme.com',
      subject: 'Hello',
      body: 'Line one\nLine two',
    })
    expect(mime).toContain('From: john@bktadvisory.com\r\n')
    expect(mime).toContain('To: recruiter@acme.com\r\n')
    expect(mime).toContain('Subject: Hello\r\n')
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(mime.endsWith('\r\n\r\nLine one\nLine two')).toBe(true)
    expect(mime).not.toContain('In-Reply-To')
  })

  it('adds In-Reply-To and References for replies', () => {
    const mime = buildMimeMessage({
      from: 'a@b.c',
      to: 'd@e.f',
      subject: 'Re: Interview',
      body: 'Works for me.',
      inReplyTo: '<abc123@mail.gmail.com>',
    })
    expect(mime).toContain('In-Reply-To: <abc123@mail.gmail.com>\r\n')
    expect(mime).toContain('References: <abc123@mail.gmail.com>\r\n')
  })
})

describe('encodeHeaderValue', () => {
  it('passes ASCII through and B-encodes non-ASCII', () => {
    expect(encodeHeaderValue('Plain subject')).toBe('Plain subject')
    const encoded = encodeHeaderValue('Résumé — update')
    expect(encoded.startsWith('=?UTF-8?B?')).toBe(true)
    expect(encoded.endsWith('?=')).toBe(true)
  })
})

describe('encodeBase64Url', () => {
  it('is url-safe, unpadded, and UTF-8 correct', () => {
    const raw = encodeBase64Url('ab?cd>eé')
    expect(raw).not.toMatch(/[+/=]/)
    // Round-trip through node's decoder to prove byte fidelity.
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toBe('ab?cd>eé')
  })

  it('produces a decodable full message via buildRawMessage', () => {
    const raw = buildRawMessage({ from: 'a@b.c', to: 'd@e.f', subject: 'Hi', body: 'Body' })
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    expect(decoded).toContain('Subject: Hi')
    expect(decoded).toContain('\r\n\r\nBody')
  })
})

describe('subject helpers', () => {
  it('prefixes once and tolerates existing prefixes', () => {
    expect(replySubject('Interview')).toBe('Re: Interview')
    expect(replySubject('Re: Interview')).toBe('Re: Interview')
    expect(replySubject('RE: Interview')).toBe('RE: Interview')
    expect(replySubject(null)).toBe('Re:')
    expect(forwardSubject('Offer letter')).toBe('Fwd: Offer letter')
    expect(forwardSubject('Fwd: Offer letter')).toBe('Fwd: Offer letter')
    expect(forwardSubject('Fw: Offer letter')).toBe('Fw: Offer letter')
  })
})
