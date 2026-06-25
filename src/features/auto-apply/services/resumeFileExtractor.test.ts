import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  decodeXmlEntities,
  detectFileKind,
  docxXmlToText,
  extractResumeText,
  ResumeExtractError,
} from './resumeFileExtractor'

describe('detectFileKind', () => {
  it('classifies by extension (case-insensitive)', () => {
    expect(detectFileKind({ name: 'Resume.PDF' })).toBe('pdf')
    expect(detectFileKind({ name: 'resume.docx' })).toBe('docx')
    expect(detectFileKind({ name: 'resume.txt' })).toBe('text')
    expect(detectFileKind({ name: 'resume.md' })).toBe('text')
    expect(detectFileKind({ name: 'resume.markdown' })).toBe('text')
  })

  it('falls back to MIME type when the extension is missing', () => {
    expect(detectFileKind({ name: 'resume', type: 'application/pdf' })).toBe('pdf')
    expect(
      detectFileKind({
        name: 'resume',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe('docx')
    expect(detectFileKind({ name: 'resume', type: 'text/markdown' })).toBe('text')
  })

  it('returns null for unsupported types (legacy .doc, images)', () => {
    expect(detectFileKind({ name: 'resume.doc' })).toBeNull()
    expect(detectFileKind({ name: 'resume.png', type: 'image/png' })).toBeNull()
  })
})

describe('decodeXmlEntities', () => {
  it('decodes named and numeric entities without double-decoding &amp;', () => {
    expect(decodeXmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeXmlEntities('a &lt; b &gt; c')).toBe('a < b > c')
    expect(decodeXmlEntities('&#65;&#x42;')).toBe('AB')
    expect(decodeXmlEntities('R&amp;amp;D')).toBe('R&amp;D')
  })
})

describe('docxXmlToText', () => {
  it('keeps run text, turns paragraphs/breaks into newlines, drops other markup', () => {
    const xml = [
      '<w:document><w:body>',
      '<w:p><w:r><w:t>John Burkhardt</w:t></w:r></w:p>',
      '<w:p><w:r><w:t xml:space="preserve">Senior </w:t></w:r><w:r><w:t>Consultant</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Tab</w:t><w:tab/><w:t>separated</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('')
    const text = docxXmlToText(xml)
    expect(text).toContain('John Burkhardt')
    expect(text).toContain('Senior Consultant')
    expect(text).toContain('Line one\nline two')
    expect(text).toContain('Tab\tseparated')
    // No XML markup leaks through.
    expect(text).not.toMatch(/<\/?w:/)
  })

  it('decodes entities inside run text', () => {
    const xml = '<w:p><w:r><w:t>R&amp;D &amp; AI</w:t></w:r></w:p>'
    expect(docxXmlToText(xml)).toBe('R&D & AI')
  })
})

/** Builds a minimal but real .docx (a ZIP whose word/document.xml holds the
 *  given paragraphs) so the extractor is exercised end-to-end, not mocked. */
function makeDocx(paragraphs: string[]): File {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')
  const xml = `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`
  const zipped = zipSync({ 'word/document.xml': strToU8(xml) })
  return new File([zipped], 'resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

describe('extractResumeText', () => {
  it('extracts plain text from a .txt file verbatim', async () => {
    const file = new File(['Jane Doe\nStaff Engineer\nSummary of work here.'], 'resume.txt', {
      type: 'text/plain',
    })
    const result = await extractResumeText(file)
    expect(result.kind).toBe('text')
    expect(result.text).toContain('Jane Doe')
    expect(result.text).toContain('Staff Engineer')
  })

  it('extracts text from a real .docx zip end-to-end', async () => {
    const file = makeDocx([
      'John Burkhardt',
      'Salesforce Consulting Leader',
      'Twelve years of enterprise delivery experience.',
    ])
    const result = await extractResumeText(file)
    expect(result.kind).toBe('docx')
    expect(result.text).toContain('John Burkhardt')
    expect(result.text).toContain('Salesforce Consulting Leader')
    expect(result.text).toContain('Twelve years of enterprise delivery experience.')
  })

  it('throws a friendly error for unsupported file types', async () => {
    const file = new File(['anything'], 'resume.doc', { type: 'application/msword' })
    await expect(extractResumeText(file)).rejects.toBeInstanceOf(ResumeExtractError)
  })

  it('throws when a file yields no usable text', async () => {
    const file = new File(['  '], 'resume.txt', { type: 'text/plain' })
    await expect(extractResumeText(file)).rejects.toBeInstanceOf(ResumeExtractError)
  })
})
