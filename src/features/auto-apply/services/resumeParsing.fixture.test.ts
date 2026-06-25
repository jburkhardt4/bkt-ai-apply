// End-to-end parsing regression against JB's ACTUAL resume (Jam a58ec7af).
// Covers both input regimes: Markdown (.md via File.text) and extracted DOCX
// (real word/document.xml re-zipped with fflate → extractResumeText). The fixtures
// in src/test-fixtures/ are the candidate's real layout, so this guards the exact
// sections the bug report flagged: Summary, Skills, Experience, Education.
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import MD from '../../../test-fixtures/john-burkhardt-resume.md?raw'
import DOCX_XML from '../../../test-fixtures/john-burkhardt-document.xml?raw'
import { extractResumeText } from './resumeFileExtractor'
import { transcribeResume } from './docContentParser'

/** Re-zip the real document.xml into a minimal but valid .docx the extractor reads. */
function docxFile(): File {
  const zipped = zipSync({ 'word/document.xml': strToU8(DOCX_XML) })
  return new File([zipped], 'john-burkhardt-resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

describe('transcribeResume — real resume (Markdown)', () => {
  const r = transcribeResume(MD)

  it('identity: clean name + contact, no Markdown markers', () => {
    expect(r.name).toBe('John Burkhardt')
    expect(r.contact).toContain('john@bktadvisory.com')
    expect(`${r.name} ${r.headline}`).not.toMatch(/[#*]|\]\(/)
  })

  it('summary maps the Executive Summary section (not blank, not the whole doc)', () => {
    expect(r.summary).toMatch(/^Salesforce-certified, consulting manager/)
    expect(r.summary).not.toMatch(/Independently secured|EXECUTIVE SUMMARY/)
    expect(r.summary).not.toMatch(/[#*]/)
  })

  it('skills keep grouped categories intact (not over-split on commas)', () => {
    expect(r.skills.length).toBeGreaterThanOrEqual(5)
    expect(r.skills.some((s) => /^CRM & Platforms:/.test(s))).toBe(true)
    expect(r.skills.some((s) => /^Integration & Development:/.test(s))).toBe(true)
    // "Dynamics 365" stays inside its category, not split into its own chip.
    expect(r.skills).not.toContain('Dynamics 365')
  })

  it('experience: all six employers parse with org, dates + bullets', () => {
    expect(r.experience).toHaveLength(6)
    const orgs = r.experience.map((e) => e.org)
    expect(orgs).toEqual(
      expect.arrayContaining(['BKT Advisory', 'Evertas', 'Carter Funds', 'SkyView Advisors']),
    )
    // Two distinct roles at the same employer keep their own dates (Evertas).
    expect(r.experience.filter((e) => e.org === 'Evertas')).toHaveLength(2)
    const bkt = r.experience.find((e) => e.org === 'BKT Advisory')!
    expect(bkt.role).toMatch(/Salesforce & AI Consultant/)
    expect(bkt.when).toMatch(/Jan 2025/)
    expect(bkt.bullets.join(' ')).toMatch(/Berkshire Hathaway/)
    expect(bkt.bullets.join(' ')).not.toMatch(/[#*]|\]\(/)
  })

  it('education: degree merges with its institution; certs are NOT here', () => {
    const degree = r.education.find((e) => /Entrepreneurship/.test(e.degree))!
    expect(degree.org).toBe('High Point University')
    expect(degree.when).toMatch(/2018/)
    expect(r.education.map((e) => e.degree).join(' ')).not.toMatch(/Certified/)
  })

  it('certifications parse into their own dedicated section', () => {
    expect(r.certifications.length).toBeGreaterThanOrEqual(4)
    expect(r.certifications).toEqual(
      expect.arrayContaining([
        'Salesforce Certified Platform Administrator',
        'Salesforce Certified Agentforce Specialist',
      ]),
    )
  })
})

describe('extractResumeText + transcribeResume — real resume (DOCX)', () => {
  it('extracts clean text (no field-code digit junk before the name)', async () => {
    const { text, kind } = await extractResumeText(docxFile())
    expect(kind).toBe('docx')
    expect(text).toMatch(/^JOHN BURKHARDT/)
  })

  it('parses the DOCX into the same key sections', async () => {
    const { text } = await extractResumeText(docxFile())
    const r = transcribeResume(text)
    expect(r.name).toBe('JOHN BURKHARDT')
    expect(r.summary).toMatch(/^Salesforce-certified, consulting manager/)
    expect(r.skills.some((s) => /^CRM & Platforms:/.test(s))).toBe(true)
    const orgs = r.experience.map((e) => e.org)
    expect(orgs).toEqual(expect.arrayContaining(['BKT Advisory', 'Evertas', 'Carter Funds']))
    expect(r.certifications.join(' | ')).toMatch(/Salesforce Certified/)
    expect(r.education.map((e) => e.degree).join(' ')).not.toMatch(/Certified/)
  })
})
