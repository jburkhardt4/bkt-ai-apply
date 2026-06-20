/**
 * schemaParse — PURE parsers from each ATS's raw read-API JSON to
 * NormalizedField[]. No I/O, no Deno.*, so each parser is unit-testable against
 * a small inline fixture. Every parser canonicalizes keys (toCanonicalKey) and
 * marks EEO/work-auth/salary/legal fields sensitive (isSensitiveField).
 *
 * Field shapes below are documented best-effort; selectors/envelopes marked
 * "live-tune" are UNVERIFIED against a live posting and must be confirmed. Each
 * parser tolerates missing/extra keys defensively (never throws on shape drift).
 *
 * ── Documented raw shapes (cited) ───────────────────────────────────────────
 * Greenhouse  Job Board API /boards/{t}/jobs/{id}?questions=true
 *             → { questions: [ { label, required, fields: [ { name, type,
 *                 values:[{label,value}] } ] } ] }
 * Lever       /v0/postings/{site}/{id}?mode=json
 *             → { lists?, categories?, additionalPlugins?,
 *                 ...; application form custom fields appear under
 *                 `customQuestions`/`additionalQuestions` (live-tune) }
 * Ashby       posting-api jobPosting
 *             → { applicationFormDefinition?: { sections:[{ fields:[{ field:{
 *                 path, type, label, isRequired, selectableValues:[{label}] } }] }] },
 *                 ... } (info formFields also accepted)
 * SmartRecruiters /postings/{id}/configuration
 *             → { screeningQuestions:{ questions:[{ label, required, type,
 *                 answers? }] }, diversityQuestions?: [...] }
 */

import type { NormalizedField } from './types.ts'
import { toCanonicalKey } from './canonicalKey.ts'
import { isSensitiveField } from './sensitivity.ts'

/** Narrow unknown → plain record (or {} on mismatch). */
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Narrow unknown → array (or [] on mismatch). */
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** Coerce unknown → string (empty on null/undefined/non-stringable). */
function asString(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Coerce unknown → boolean (true only for literal true / 'true' / 'required'). */
function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v.toLowerCase() === 'required'
  return false
}

/** Builds a NormalizedField, canonicalizing the key + flagging sensitivity. */
function makeField(
  label: string,
  name: string,
  type: string,
  required: boolean,
  options: string[] | undefined,
): NormalizedField | null {
  const key = toCanonicalKey(label, name)
  if (!key) return null
  const effectiveLabel = label || name || key
  return {
    key,
    label: effectiveLabel,
    type: type || 'text',
    required,
    options: options && options.length > 0 ? options : undefined,
    sensitive: isSensitiveField(key, effectiveLabel),
  }
}

/** Extracts option labels from a values:[{label,value}] array. */
function optionLabels(values: unknown): string[] | undefined {
  const arr = asArray(values)
  if (arr.length === 0) return undefined
  const labels = arr
    .map((o) => {
      const rec = asRecord(o)
      return asString(rec.label ?? rec.value ?? o)
    })
    .filter(Boolean)
  return labels.length > 0 ? labels : undefined
}

/** De-dupes fields by canonical key (first occurrence wins). */
function dedupe(fields: NormalizedField[]): NormalizedField[] {
  const seen = new Set<string>()
  const out: NormalizedField[] = []
  for (const f of fields) {
    if (seen.has(f.key)) continue
    seen.add(f.key)
    out.push(f)
  }
  return out
}

/**
 * Greenhouse Job Board API: questions[].fields[] with name/type/values/required.
 * The question's `required` cascades to each of its fields.
 */
export function parseGreenhouseSchema(raw: unknown): NormalizedField[] {
  const root = asRecord(raw)
  const questions = asArray(root.questions)
  const out: NormalizedField[] = []

  for (const q of questions) {
    const qr = asRecord(q)
    const qLabel = asString(qr.label)
    const required = asBool(qr.required)
    const fields = asArray(qr.fields)
    if (fields.length === 0) {
      // Some questions carry the label only (no nested fields) — still a field.
      const f = makeField(qLabel, asString(qr.name), 'text', required, undefined)
      if (f) out.push(f)
      continue
    }
    for (const fld of fields) {
      const fr = asRecord(fld)
      const name = asString(fr.name)
      const type = asString(fr.type)
      const options = optionLabels(fr.values)
      const f = makeField(qLabel, name, type, required, options)
      if (f) out.push(f)
    }
  }

  return dedupe(out)
}

/**
 * Lever postings (mode=json). Custom application questions surface under
 * `customQuestions[].fields[]` / `additionalQuestions[]` (live-tune: exact key
 * varies by posting). We also synthesize the standard name/email/phone/resume
 * fields Lever always collects so the mapper has them.
 */
export function parseLeverSchema(raw: unknown): NormalizedField[] {
  const root = asRecord(raw)
  const out: NormalizedField[] = []

  // Lever's hosted apply form always collects these standard fields.
  const standards: Array<[string, string, string, boolean]> = [
    ['Full name', 'name', 'text', true],
    ['Email', 'email', 'text', true],
    ['Phone', 'phone', 'text', false],
    ['Resume / CV', 'resume', 'file', true],
  ]
  for (const [label, name, type, required] of standards) {
    const f = makeField(label, name, type, required, undefined)
    if (f) out.push(f)
  }

  // Custom screener questions (live-tune key).
  const customBlocks = [
    ...asArray(root.customQuestions),
    ...asArray(root.additionalQuestions),
  ]
  for (const block of customBlocks) {
    const br = asRecord(block)
    const blockFields = asArray(br.fields)
    if (blockFields.length === 0) {
      const f = makeField(asString(br.text ?? br.label), asString(br.id), asString(br.type) || 'text', asBool(br.required), optionLabels(br.options))
      if (f) out.push(f)
      continue
    }
    for (const fld of blockFields) {
      const fr = asRecord(fld)
      const f = makeField(
        asString(fr.text ?? fr.label),
        asString(fr.id ?? fr.name),
        asString(fr.type) || 'text',
        asBool(fr.required),
        optionLabels(fr.options ?? fr.values),
      )
      if (f) out.push(f)
    }
  }

  return dedupe(out)
}

/**
 * Ashby posting-api: applicationFormDefinition.sections[].fields[].field with
 * { path, type, label, isRequired, selectableValues:[{label}] }. `info.formFields`
 * is accepted as an alternate envelope (live-tune).
 */
export function parseAshbySchema(raw: unknown): NormalizedField[] {
  const root = asRecord(raw)
  const out: NormalizedField[] = []

  const formDef = asRecord(root.applicationFormDefinition)
  const sections = asArray(formDef.sections)
  for (const section of sections) {
    const sr = asRecord(section)
    const fields = asArray(sr.fields)
    for (const wrapper of fields) {
      const wr = asRecord(wrapper)
      const field = asRecord(wr.field ?? wrapper)
      const label = asString(field.label ?? field.title)
      const name = asString(field.path ?? field.id)
      const type = asString(field.type)
      const required = asBool(field.isRequired ?? field.required)
      const options = optionLabels(field.selectableValues ?? field.options)
      const f = makeField(label, name, type, required, options)
      if (f) out.push(f)
    }
  }

  // Alternate envelope: info.formFields[] (live-tune).
  const info = asRecord(root.info)
  const formFields = asArray(info.formFields)
  for (const wrapper of formFields) {
    const wr = asRecord(wrapper)
    const field = asRecord(wr.field ?? wrapper)
    const f = makeField(
      asString(field.label ?? field.title),
      asString(field.path ?? field.id),
      asString(field.type),
      asBool(field.isRequired ?? field.required),
      optionLabels(field.selectableValues ?? field.options),
    )
    if (f) out.push(f)
  }

  return dedupe(out)
}

/**
 * SmartRecruiters posting configuration: screeningQuestions.questions[] plus an
 * optional diversityQuestions[] block. Diversity questions are EEO → sensitive
 * (caught by isSensitiveField via key/label).
 */
export function parseSmartRecruitersSchema(raw: unknown): NormalizedField[] {
  const root = asRecord(raw)
  const out: NormalizedField[] = []

  const screening = asRecord(root.screeningQuestions)
  const questions = asArray(screening.questions)
  for (const q of questions) {
    const qr = asRecord(q)
    const f = makeField(
      asString(qr.label ?? qr.question ?? qr.text),
      asString(qr.id ?? qr.name),
      asString(qr.type) || 'text',
      asBool(qr.required),
      optionLabels(qr.answers ?? qr.options ?? qr.values),
    )
    if (f) out.push(f)
  }

  // Diversity / EEO questions (live-tune key).
  const diversity = asArray(root.diversityQuestions)
  for (const q of diversity) {
    const qr = asRecord(q)
    const f = makeField(
      asString(qr.label ?? qr.question ?? qr.text),
      asString(qr.id ?? qr.name),
      asString(qr.type) || 'select',
      asBool(qr.required),
      optionLabels(qr.answers ?? qr.options ?? qr.values),
    )
    if (f) out.push(f)
  }

  return dedupe(out)
}
