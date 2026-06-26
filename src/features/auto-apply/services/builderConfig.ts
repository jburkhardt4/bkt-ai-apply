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

/** Defaults match the EXISTING rendering, so a resume looks identical until the
 *  user actually toggles something (experience/certs already render as bullets). */
export function defaultBuilderConfig(): BuilderConfig {
  return {
    sectionBullets: { experience: true, skills: false, education: false, certifications: true },
    customSections: [],
  }
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
