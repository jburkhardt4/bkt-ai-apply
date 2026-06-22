import { describe, it, expect } from 'vitest'
import { toAnswerType, toAnswerInput } from './preferencesProfile'

describe('toAnswerType', () => {
  it('coerces to the typed union, defaulting unknown/empty to text', () => {
    expect(toAnswerType('boolean')).toBe('boolean')
    expect(toAnswerType('select')).toBe('select')
    expect(toAnswerType('textarea')).toBe('textarea')
    expect(toAnswerType('text')).toBe('text')
    expect(toAnswerType('mystery')).toBe('text')
    expect(toAnswerType(null)).toBe('text')
    expect(toAnswerType(undefined)).toBe('text')
  })
})

describe('toAnswerInput', () => {
  it('derives the question_key slug, trims the label, and carries the typed answer', () => {
    expect(toAnswerInput('Years of Salesforce experience?', '8', 'text')).toEqual({
      question_key: 'years-of-salesforce-experience',
      question_label: 'Years of Salesforce experience?',
      answer: '8',
      answer_type: 'text',
    })
    expect(toAnswerInput('  Willing to relocate?  ', 'Yes', 'boolean')?.question_label).toBe(
      'Willing to relocate?',
    )
    expect(toAnswerInput('Notice period', 'Immediately', 'select')?.answer_type).toBe('select')
  })

  it('returns null when the label yields no slug (never writes an unkeyed row)', () => {
    expect(toAnswerInput('   ', 'x', 'text')).toBeNull()
    expect(toAnswerInput('!!!', 'x', 'text')).toBeNull()
  })
})
