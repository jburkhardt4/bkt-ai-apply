import { describe, expect, it } from 'vitest'
import { mapFields } from './fieldMap.ts'
import type { CandidateData, MappedField, NormalizedField, NormalizedSchema } from './types.ts'

/** Builds a minimal NormalizedSchema around a field list. */
function schema(fields: NormalizedField[]): NormalizedSchema {
  return {
    atsFamily: 'greenhouse',
    antibotTier: 'low',
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    externalJobId: '1',
    fields,
  }
}

function field(partial: Partial<NormalizedField> & { key: string }): NormalizedField {
  return {
    label: partial.label ?? partial.key,
    type: partial.type ?? 'text',
    required: partial.required ?? false,
    sensitive: partial.sensitive ?? false,
    options: partial.options,
    key: partial.key,
  }
}

function byKey(fields: MappedField[], key: string): MappedField | undefined {
  return fields.find((f) => f.fieldKey === key)
}

describe('mapFields', () => {
  describe('direct profile mapping', () => {
    it('maps email/phone from profile with confidence 1', () => {
      const candidate: CandidateData = { email: 'a@b.com', phone: '555-1212' }
      const out = mapFields(schema([field({ key: 'email', required: true }), field({ key: 'phone' })]), candidate)
      expect(byKey(out, 'email')).toMatchObject({
        mappedValue: 'a@b.com',
        valueSource: 'profile',
        confidence: 1,
        reviewGate: false,
      })
      expect(byKey(out, 'phone')?.valueSource).toBe('profile')
    })
  })

  describe('name-split derived case', () => {
    it('derives first/last from fullName when no explicit first/last is stored', () => {
      const candidate: CandidateData = { fullName: 'Ada Lovelace King' }
      const out = mapFields(schema([field({ key: 'first_name' }), field({ key: 'last_name' })]), candidate)
      expect(byKey(out, 'first_name')).toMatchObject({
        mappedValue: 'Ada',
        valueSource: 'derived',
        confidence: 0.6,
      })
      expect(byKey(out, 'last_name')).toMatchObject({
        mappedValue: 'Lovelace King',
        valueSource: 'derived',
        confidence: 0.6,
      })
    })

    it('prefers an explicit first/last over the derived split', () => {
      const candidate: CandidateData = { fullName: 'Ada Lovelace', firstName: 'Augusta' }
      const out = mapFields(schema([field({ key: 'first_name' })]), candidate)
      expect(byKey(out, 'first_name')).toMatchObject({ mappedValue: 'Augusta', valueSource: 'profile', confidence: 1 })
    })

    it('treats explicit first_name AND last_name as authoritative (profile / confidence 1, not derived 0.6)', () => {
      const candidate: CandidateData = { firstName: 'John', lastName: 'Burkhardt' }
      const out = mapFields(schema([field({ key: 'first_name' }), field({ key: 'last_name' })]), candidate)

      const first = byKey(out, 'first_name')
      expect(first).toMatchObject({ mappedValue: 'John', valueSource: 'profile', confidence: 1 })
      // Explicitly NOT the derived split path.
      expect(first?.valueSource).not.toBe('derived')
      expect(first?.confidence).not.toBe(0.6)

      const last = byKey(out, 'last_name')
      expect(last).toMatchObject({ mappedValue: 'Burkhardt', valueSource: 'profile', confidence: 1 })
      expect(last?.valueSource).not.toBe('derived')
      expect(last?.confidence).not.toBe(0.6)
    })
  })

  describe('default / no value', () => {
    it('emits default + confidence 0 when nothing is on file', () => {
      const out = mapFields(schema([field({ key: 'website' })]), {})
      expect(byKey(out, 'website')).toMatchObject({ mappedValue: null, valueSource: 'default', confidence: 0 })
    })

    it('review-gates a REQUIRED field with no confident value', () => {
      const out = mapFields(schema([field({ key: 'website', required: true })]), {})
      expect(byKey(out, 'website')?.reviewGate).toBe(true)
    })

    it('does not review-gate an optional field with no value', () => {
      const out = mapFields(schema([field({ key: 'website', required: false })]), {})
      expect(byKey(out, 'website')?.reviewGate).toBe(false)
    })
  })

  describe('file fields are manual', () => {
    it('never auto-fills resume/cover_letter (null value, manual)', () => {
      const out = mapFields(
        schema([field({ key: 'resume', type: 'file', required: true }), field({ key: 'cover_letter', type: 'file' })]),
        { email: 'a@b.com' },
      )
      const resume = byKey(out, 'resume')
      expect(resume).toMatchObject({ mappedValue: null, valueSource: 'default', confidence: 0 })
      expect(resume?.reviewGate).toBe(true) // required file → review-gated
      expect(byKey(out, 'cover_letter')?.mappedValue).toBeNull()
    })
  })

  describe('sensitive ⇒ review_gate invariant', () => {
    it('always review-gates a sensitive field even when a value exists', () => {
      const candidate: CandidateData = {
        workAuthorization: 'US Citizen',
        eeo: { eeo_gender: 'Female' },
      }
      const out = mapFields(
        schema([
          field({ key: 'work_auth', sensitive: true }),
          field({ key: 'eeo_gender', sensitive: true }),
        ]),
        candidate,
      )
      const workAuth = byKey(out, 'work_auth')
      expect(workAuth?.isSensitive).toBe(true)
      expect(workAuth?.reviewGate).toBe(true)
      expect(workAuth?.redactionSafe).toBe(false)

      const gender = byKey(out, 'eeo_gender')
      expect(gender?.mappedValue).toBe('Female') // autofill value present
      expect(gender?.reviewGate).toBe(true) // but still review-gated
    })
  })

  describe('autofill-only custom answers', () => {
    it('fills a stored answer by question_key', () => {
      const candidate: CandidateData = { answers: { why_us: 'Mission alignment.' } }
      const out = mapFields(schema([field({ key: 'answer:why_us', required: true })]), candidate)
      expect(byKey(out, 'answer:why_us')).toMatchObject({
        mappedValue: 'Mission alignment.',
        valueSource: 'profile',
        reviewGate: false,
      })
    })
  })

  describe('requires_sponsorship tri-state', () => {
    it('maps false → "No" from profile', () => {
      const out = mapFields(schema([field({ key: 'requires_sponsorship', sensitive: true })]), {
        requiresSponsorship: false,
      })
      const f = byKey(out, 'requires_sponsorship')
      expect(f?.mappedValue).toBe('No')
      expect(f?.reviewGate).toBe(true) // sensitive
    })
  })
})
