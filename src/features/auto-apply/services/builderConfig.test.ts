import { describe, expect, it } from 'vitest'
import {
  builderConfigToJson,
  customSectionItems,
  customSectionRows,
  defaultBuilderConfig,
  effectiveSectionOrder,
  MAX_CUSTOM_SECTIONS,
  parseBuilderConfig,
} from './builderConfig'

describe('parseBuilderConfig', () => {
  it('returns defaults for null/garbage (matching current rendering)', () => {
    const def = defaultBuilderConfig()
    expect(parseBuilderConfig(null)).toEqual(def)
    expect(parseBuilderConfig('nope' as never)).toEqual(def)
    expect(parseBuilderConfig([] as never)).toEqual(def)
    expect(def.sectionBullets).toEqual({ experience: true, skills: false, education: false, certifications: true })
  })

  it('merges partial section toggles over defaults', () => {
    const c = parseBuilderConfig({ sectionBullets: { skills: true, education: true } })
    expect(c.sectionBullets).toEqual({ experience: true, skills: true, education: true, certifications: true })
  })

  it('coerces custom sections, defaulting bad formats and capping at 4', () => {
    const c = parseBuilderConfig({
      customSections: [
        { id: 'a', title: 'Volunteer', format: 'table', body: 'Org | Role' },
        { title: 'No id', format: 'weird', body: 'x' },
        { title: 'P', format: 'text', body: 'para' },
        { title: 'B', format: 'bullets', body: '- one' },
        { title: 'Over the cap', format: 'text', body: 'dropped' },
      ],
    })
    expect(c.customSections).toHaveLength(MAX_CUSTOM_SECTIONS)
    expect(c.customSections[0]).toMatchObject({ id: 'a', title: 'Volunteer', format: 'table' })
    expect(c.customSections[1]).toMatchObject({ format: 'bullets' }) // bad format → bullets
    expect(c.customSections[1]?.id).toBeTruthy()
  })

  it('round-trips through builderConfigToJson', () => {
    const c = parseBuilderConfig({
      sectionBullets: { skills: true },
      customSections: [{ id: 'x', title: 'Awards', format: 'bullets', body: '- Best' }],
    })
    expect(parseBuilderConfig(builderConfigToJson(c))).toEqual(c)
  })
})

describe('effectiveSectionOrder', () => {
  it('defaults to the four standard sections', () => {
    expect(effectiveSectionOrder(defaultBuilderConfig())).toEqual([
      'experience',
      'education',
      'skills',
      'certifications',
    ])
  })

  it('keeps the stored order, drops stale keys, and appends any missing', () => {
    const c = parseBuilderConfig({
      customSections: [{ id: 'a', title: 'A', format: 'text', body: 'x' }],
      sectionOrder: ['skills', 'stale-key', 'experience', 'a'],
    })
    // 'stale-key' dropped; 'education' + 'certifications' appended; order kept.
    expect(c.sectionOrder).toEqual(['skills', 'experience', 'a', 'education', 'certifications'])
  })
})

describe('custom section body parsers', () => {
  it('customSectionItems splits non-empty lines and strips bullet glyphs', () => {
    expect(customSectionItems('- one\n* two\n\n  three  ')).toEqual(['one', 'two', 'three'])
  })

  it('customSectionRows builds a grid split on |', () => {
    expect(customSectionRows('Org | Role | Year\nAcme | Lead | 2024')).toEqual([
      ['Org', 'Role', 'Year'],
      ['Acme', 'Lead', '2024'],
    ])
  })
})
