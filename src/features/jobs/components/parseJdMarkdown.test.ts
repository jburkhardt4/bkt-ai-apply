import { describe, expect, it } from 'vitest'
import { parseInlineSegments, parseJdMarkdown } from './parseJdMarkdown'

describe('parseJdMarkdown', () => {
  it('returns no blocks for empty input', () => {
    expect(parseJdMarkdown('')).toEqual([])
    expect(parseJdMarkdown('   \n  \n')).toEqual([])
  })

  it('parses ### headings into heading blocks', () => {
    const blocks = parseJdMarkdown('### About the Role')
    expect(blocks).toEqual([{ type: 'heading', text: 'About the Role' }])
  })

  it('strips trailing closing hashes from headings', () => {
    const blocks = parseJdMarkdown('### Requirements ###')
    expect(blocks).toEqual([{ type: 'heading', text: 'Requirements' }])
  })

  it('collapses consecutive bullet lines into a single list', () => {
    const md = ['* First duty', '* Second duty', '- Third duty'].join('\n')
    const blocks = parseJdMarkdown(md)
    expect(blocks).toEqual([
      { type: 'list', items: ['First duty', 'Second duty', 'Third duty'] },
    ])
  })

  it('collapses wrapped plain lines into one paragraph and splits on blank lines', () => {
    const md = ['We are hiring', 'a great engineer.', '', 'Join us today.'].join('\n')
    const blocks = parseJdMarkdown(md)
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'We are hiring a great engineer.' },
      { type: 'paragraph', text: 'Join us today.' },
    ])
  })

  it('handles a full mixed document with headings, paragraphs, and lists', () => {
    const md = [
      '### About the Role',
      'Build great software.',
      '',
      '### Key Responsibilities',
      '* Ship features',
      '* Review code',
      '### Requirements/Qualifications',
      '* 5 years experience',
    ].join('\n')

    const blocks = parseJdMarkdown(md)
    expect(blocks).toEqual([
      { type: 'heading', text: 'About the Role' },
      { type: 'paragraph', text: 'Build great software.' },
      { type: 'heading', text: 'Key Responsibilities' },
      { type: 'list', items: ['Ship features', 'Review code'] },
      { type: 'heading', text: 'Requirements/Qualifications' },
      { type: 'list', items: ['5 years experience'] },
    ])
  })

  it('normalizes CRLF and CR line endings', () => {
    const blocks = parseJdMarkdown('### Title\r\n* one\r* two')
    expect(blocks).toEqual([
      { type: 'heading', text: 'Title' },
      { type: 'list', items: ['one', 'two'] },
    ])
  })
})

describe('parseInlineSegments', () => {
  it('returns a single plain segment when there is no bold', () => {
    expect(parseInlineSegments('plain text')).toEqual([{ text: 'plain text', bold: false }])
  })

  it('splits bold spans from surrounding plain text', () => {
    expect(parseInlineSegments('Lead **Backend** team')).toEqual([
      { text: 'Lead ', bold: false },
      { text: 'Backend', bold: true },
      { text: ' team', bold: false },
    ])
  })

  it('handles bold at the start and end', () => {
    expect(parseInlineSegments('**Must** have **Go**')).toEqual([
      { text: 'Must', bold: true },
      { text: ' have ', bold: false },
      { text: 'Go', bold: true },
    ])
  })

  it('never emits raw HTML — segments are plain text only', () => {
    const segments = parseInlineSegments('<script>alert(1)</script> **safe**')
    expect(segments).toEqual([
      { text: '<script>alert(1)</script> ', bold: false },
      { text: 'safe', bold: true },
    ])
  })
})
