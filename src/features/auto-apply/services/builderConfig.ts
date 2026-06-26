// BKT AI-Apply — builder formatting config (Phase 2): per-section bullet toggles
// + user-defined custom sections, persisted to `documents.builder_config` (jsonb).
// Pure parse/serialize/default helpers so the (untyped) jsonb is coerced safely
// and the UI/render code stay simple. Unit-tested.
import type { Json } from '@/types/db.types'
import type {
  BuilderConfig,
  CustomSection,
  CustomSectionFormat,
  SectionBulletKey,
} from '../types'

export const MAX_CUSTOM_SECTIONS = 4

const BULLET_KEYS: SectionBulletKey[] = ['experience', 'skills', 'education', 'certifications']
const FORMATS: CustomSectionFormat[] = ['bullets', 'table', 'text']
/** The reorderable standard content sections, in their default order. */
export const STANDARD_SECTION_ORDER = ['experience', 'education', 'skills', 'certifications']

/** Defaults match the EXISTING rendering, so a resume looks identical until the
 *  user actually toggles something (experience/certs already render as bullets). */
export function defaultBuilderConfig(): BuilderConfig {
  return {
    sectionBullets: { experience: true, skills: false, education: false, certifications: true },
    customSections: [],
    sectionOrder: [...STANDARD_SECTION_ORDER],
  }
}

/**
 * The effective render/edit order of the resume's content sections: the stored
 * order, but always containing exactly the 4 standard keys + every current custom
 * section id (stale ids dropped, missing ones appended). Resilient to config drift.
 */
export function effectiveSectionOrder(config: BuilderConfig): string[] {
  const valid = new Set<string>([...STANDARD_SECTION_ORDER, ...config.customSections.map((s) => s.id)])
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of config.sectionOrder) {
    if (valid.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  for (const key of valid) if (!seen.has(key)) out.push(key)
  return out
}

/** Coerces the untyped `builder_config` jsonb into a complete, valid BuilderConfig. */
export function parseBuilderConfig(raw: Json | null | undefined): BuilderConfig {
  const config = defaultBuilderConfig()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return config

  const obj = raw as Record<string, unknown>
  const sb = (obj.sectionBullets ?? {}) as Record<string, unknown>
  for (const key of BULLET_KEYS) {
    if (typeof sb[key] === 'boolean') config.sectionBullets[key] = sb[key] as boolean
  }

  const rawCustom = Array.isArray(obj.customSections) ? obj.customSections : []
  config.customSections = rawCustom.slice(0, MAX_CUSTOM_SECTIONS).map((entry, index): CustomSection => {
    const c = (entry ?? {}) as Record<string, unknown>
    const format = FORMATS.includes(c.format as CustomSectionFormat)
      ? (c.format as CustomSectionFormat)
      : 'bullets'
    return {
      id: typeof c.id === 'string' && c.id ? c.id : `cs-${index}`,
      title: typeof c.title === 'string' ? c.title : '',
      format,
      body: typeof c.body === 'string' ? c.body : '',
    }
  })

  if (Array.isArray(obj.sectionOrder)) {
    config.sectionOrder = obj.sectionOrder.filter((k): k is string => typeof k === 'string')
  }
  // Normalize against the actual sections so the order is always complete/valid.
  config.sectionOrder = effectiveSectionOrder(config)
  return config
}

/** Serializes a BuilderConfig to the `builder_config` jsonb shape. */
export function builderConfigToJson(config: BuilderConfig): Json {
  return {
    sectionBullets: { ...config.sectionBullets },
    customSections: config.customSections.map((c) => ({
      id: c.id,
      title: c.title,
      format: c.format,
      body: c.body,
    })),
    sectionOrder: [...config.sectionOrder],
  } as Json
}

/** Parses a custom section's `body` into a 2-D grid for table rendering: one row
 *  per non-empty line, cells split on `|`. */
export function customSectionRows(body: string): string[][] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|').map((cell) => cell.trim()))
}

/** Parses a custom section's `body` into bullet/line items (one per non-empty line). */
export function customSectionItems(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)
}
