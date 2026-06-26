import { describe, expect, it } from 'vitest'
import { parseGeneratedLetter, parseGeneratedResume, toParagraphs, transcribeResume } from './docContentParser'

describe('parseGeneratedResume', () => {
  const opts = {
    headline: 'Staff Engineer',
    jobSkills: ['TypeScript', 'React'],
    baseSkills: ['React', 'Node'],
    baseExperience: [{ role: 'Engineer', org: 'Acme', when: '2020', bullets: ['Shipped X'] }],
  }

  it('puts only the summary section in summary (not the whole document)', () => {
    const text = [
      '## Professional Summary',
      'Seasoned engineer with 10 years of impact.',
      '',
      '## Impact Highlights',
      '- Cut latency by 40%',
      '- Led a team of 6',
      '',
      '## Skills',
      'GraphQL, Postgres',
    ].join('\n')

    const patch = parseGeneratedResume(text, opts)
    expect(patch.summary).toBe('Seasoned engineer with 10 years of impact.')
    expect(patch.summary).not.toContain('Cut latency')
    expect(patch.headline).toBe('Staff Engineer')
  })

  it('merges posting + parsed + existing skills (deduped, posting first)', () => {
    const text = '## Summary\nHi.\n\n## Skills\nGraphQL, React'
    const patch = parseGeneratedResume(text, opts)
    expect(patch.skills).toEqual(['TypeScript', 'React', 'GraphQL', 'Node'])
  })

  it('folds parsed impact bullets into the first existing experience entry', () => {
    const text = '## Summary\nHi.\n\n## Impact Highlights\n- Cut latency by 40%\n- Led a team of 6'
    const patch = parseGeneratedResume(text, opts)
    expect(patch.experience?.[0]?.bullets).toEqual(['Cut latency by 40%', 'Led a team of 6', 'Shipped X'])
    expect(patch.experience?.[0]?.org).toBe('Acme')
  })

  it('treats an unstructured blob as the summary and leaves experience untouched', () => {
    const patch = parseGeneratedResume('A single paragraph resume blurb.', opts)
    expect(patch.summary).toBe('A single paragraph resume blurb.')
    expect(patch.experience).toBeUndefined()
  })

  it('strips em-dashes from the generated summary and bullets (no-em-dash rule)', () => {
    const text = [
      '## Summary',
      'Consulting leader — pragmatic architecture and clean governance.',
      '',
      '## Impact Highlights',
      '- Cut quote turnaround 38% — across CPQ and Billing',
    ].join('\n')

    const patch = parseGeneratedResume(text, opts)
    expect(patch.summary).not.toMatch(/[—–]/)
    expect(patch.summary).toBe('Consulting leader, pragmatic architecture and clean governance.')
    expect(patch.experience?.[0]?.bullets.some((b) => /[—–]/.test(b))).toBe(false)
  })
})

describe('transcribeResume', () => {
  const RESUME = [
    'Jane Q. Candidate',
    'Senior Salesforce Architect',
    'jane@example.com · (555) 123-4567 · linkedin.com/in/janeqc',
    '',
    'SUMMARY',
    'Salesforce architect with 8 years delivering enterprise CRM. Led 10+ implementations.',
    '',
    'EXPERIENCE',
    'Salesforce Architect — Acme Consulting · 2019–Present',
    '- Designed CPQ architecture cutting quote time 38%.',
    '- Led delivery teams of 30+ consultants.',
    'Salesforce Admin, BetaCorp, 2016-2019',
    '- Built 40+ Flows and validation rules.',
    '',
    'EDUCATION',
    'B.S. Information Systems — State University · 2015',
    '',
    'SKILLS',
    'Apex, LWC, Sales Cloud, Service Cloud, Flows',
  ].join('\n')

  it('transcribes the header, summary, education, and skills VERBATIM (no rewrite)', () => {
    const r = transcribeResume(RESUME)
    expect(r.name).toBe('Jane Q. Candidate')
    expect(r.headline).toBe('Senior Salesforce Architect')
    expect(r.contact).toContain('jane@example.com')
    // The candidate's own words are preserved — not reworded.
    expect(r.summary).toContain('8 years delivering enterprise CRM')
    expect(r.summary).toContain('Led 10+ implementations')
    expect(r.skills).toEqual(expect.arrayContaining(['Apex', 'LWC', 'Sales Cloud', 'Service Cloud', 'Flows']))
    expect(r.education).toHaveLength(1)
    expect(r.education[0]?.degree).toContain('Information Systems')
    expect(r.education[0]?.when).toBe('2015')
  })

  it('collapses hard line breaks in the summary into a single paragraph', () => {
    const text = [
      'Jane Q. Candidate',
      '',
      'SUMMARY',
      'Salesforce architect with 8 years',
      'delivering enterprise CRM across',
      'Sales and Service Cloud.',
    ].join('\n')
    const r = transcribeResume(text)
    expect(r.summary).toBe('Salesforce architect with 8 years delivering enterprise CRM across Sales and Service Cloud.')
    expect(r.summary).not.toMatch(/\n/)
  })

  it('splits experience into roles with verbatim bullets', () => {
    const r = transcribeResume(RESUME)
    expect(r.experience).toHaveLength(2)
    expect(r.experience[0]?.role).toContain('Architect')
    expect(r.experience[0]?.org).toContain('Acme')
    expect(r.experience[0]?.when).toContain('2019')
    expect(r.experience[0]?.bullets).toContain('Designed CPQ architecture cutting quote time 38%.')
    expect(r.experience[1]?.role).toContain('Admin')
    expect(r.experience[1]?.bullets).toContain('Built 40+ Flows and validation rules.')
  })

  it('never throws on unstructured text; preserves the content (no rewrite)', () => {
    const r = transcribeResume('Just some freeform text about me.\nMore detail here.')
    expect(r.name).toBe('Just some freeform text about me.')
    // The second line is preserved (as headline/summary) — nothing is lost or reworded.
    expect(`${r.headline} ${r.summary}`).toContain('More detail here')
  })
})

describe('parseGeneratedLetter', () => {
  it('maps the full letter into the body array, capturing greeting and dropping the sign-off', () => {
    const text = [
      'Dear Globex Hiring Team,',
      '',
      'I am excited to apply for the Staff Engineer role.',
      '',
      'My background aligns closely with your needs.',
      '',
      'Sincerely,',
    ].join('\n')

    const patch = parseGeneratedLetter(text, { company: 'Globex', role: 'Staff Engineer' })
    expect(patch.greeting).toBe('Dear Globex Hiring Team,')
    expect(patch.body).toEqual([
      'I am excited to apply for the Staff Engineer role.',
      'My background aligns closely with your needs.',
    ])
    expect(patch.company).toBe('Globex')
    expect(patch.role).toBe('Staff Engineer')
    expect(patch.recipient).toBe('Globex Hiring Team')
  })

  it('falls back to a default greeting and keeps a single-paragraph body', () => {
    const patch = parseGeneratedLetter('A short, eager paragraph.', { company: 'Initech', role: 'PM' })
    expect(patch.greeting).toBe('Dear Initech Hiring Team,')
    expect(patch.body).toEqual(['A short, eager paragraph.'])
  })
})

describe('toParagraphs', () => {
  it('splits on blank lines, collapses internal whitespace, and strips code fences', () => {
    expect(toParagraphs('```\nfoo\nbar\n```\n\nbaz')).toEqual(['foo bar', 'baz'])
  })
})
