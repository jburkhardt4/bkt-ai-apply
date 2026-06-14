import { describe, expect, it } from 'vitest'
import { parseGeneratedLetter, parseGeneratedResume, toParagraphs } from './docContentParser'

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
