import { describe, expect, it } from 'vitest'
import { preparedToPayload, type PreparedFieldRow } from './preparedFill'

describe('preparedToPayload', () => {
  it('maps non-gated fields through with their field_key verbatim', () => {
    const fields: PreparedFieldRow[] = [
      { field_key: 'first_name', mapped_value: 'John', review_gate: false, is_sensitive: false },
      { field_key: 'last_name', mapped_value: 'Burkhardt', review_gate: false, is_sensitive: false },
      { field_key: 'email', mapped_value: 'john@bktadvisory.com', review_gate: false },
      { field_key: 'phone', mapped_value: '555-0100' },
    ]
    const { payload, gated } = preparedToPayload(fields)
    expect(payload).toEqual({
      first_name: 'John',
      last_name: 'Burkhardt',
      email: 'john@bktadvisory.com',
      phone: '555-0100',
    })
    expect(gated).toEqual([])
  })

  it('EXCLUDES review-gated fields from the payload and lists them in gated', () => {
    const fields: PreparedFieldRow[] = [
      { field_key: 'first_name', mapped_value: 'John', review_gate: false },
      // review-gated non-sensitive (e.g. a free-text screener requiring review)
      { field_key: 'answer:why_us', free_text_draft: 'Drafted answer', review_gate: true },
    ]
    const { payload, gated } = preparedToPayload(fields)
    expect(payload).toEqual({ first_name: 'John' })
    expect(payload['answer:why_us']).toBeUndefined()
    expect(gated).toEqual(['answer:why_us'])
  })

  it('EXCLUDES sensitive fields even if review_gate is somehow not set (BR-156 belt-and-suspenders)', () => {
    const fields: PreparedFieldRow[] = [
      { field_key: 'eeo_gender', mapped_value: 'Male', is_sensitive: true, review_gate: false },
      { field_key: 'work_auth', mapped_value: 'Authorized', is_sensitive: true },
      { field_key: 'requires_sponsorship', mapped_value: false, is_sensitive: true, review_gate: true },
      { field_key: 'location', mapped_value: 'Austin', is_sensitive: false },
    ]
    const { payload, gated } = preparedToPayload(fields)
    // Only the non-sensitive field is auto-fillable.
    expect(payload).toEqual({ location: 'Austin' })
    // Every sensitive field is held back for human review.
    expect(gated).toEqual(['eeo_gender', 'work_auth', 'requires_sponsorship'])
  })

  it('coerces jsonb scalar shapes; drops null/empty/object values (no fabrication)', () => {
    const fields: PreparedFieldRow[] = [
      { field_key: 'phone', mapped_value: 12345 },
      { field_key: 'website', mapped_value: '   https://x.com  ' }, // trimmed
      { field_key: 'empty', mapped_value: '   ' }, // empty after trim → dropped
      { field_key: 'nullish', mapped_value: null }, // dropped
      { field_key: 'employment_history', mapped_value: { company: 'Acme' } }, // object → dropped
      { field_key: 'flag', mapped_value: true }, // boolean → 'Yes'
    ]
    const { payload } = preparedToPayload(fields)
    expect(payload).toEqual({
      phone: '12345',
      website: 'https://x.com',
      flag: 'Yes',
    })
    expect(payload['empty']).toBeUndefined()
    expect(payload['nullish']).toBeUndefined()
    expect(payload['employment_history']).toBeUndefined()
  })

  it('falls back to free_text_draft when there is no mapped value (non-gated only)', () => {
    const fields: PreparedFieldRow[] = [
      { field_key: 'answer:years', mapped_value: null, free_text_draft: '12', review_gate: false },
    ]
    const { payload } = preparedToPayload(fields)
    expect(payload['answer:years']).toBe('12')
  })

  it('is defensive: empty / malformed input never throws', () => {
    expect(preparedToPayload([])).toEqual({ payload: {}, gated: [] })
    const fields = [
      { field_key: '' } as PreparedFieldRow, // empty key → skipped
      { field_key: '   ' } as PreparedFieldRow, // whitespace key → skipped
    ]
    expect(preparedToPayload(fields)).toEqual({ payload: {}, gated: [] })
  })
})
