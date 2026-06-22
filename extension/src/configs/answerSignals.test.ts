import { describe, it, expect } from 'vitest'
import { toAnswerEntries } from './answerSignals'

describe('toAnswerEntries (B4 Answer Library enrichment)', () => {
  it('maps rows → entries, joins aliases + sensitivity, drops blank/keyless rows', () => {
    const entries = toAnswerEntries([
      { question_key: 'sf_years', question_label: 'Years of Salesforce experience', answer: '8', answer_type: 'text' },
      { question_key: 'desired_salary', question_label: 'Desired salary', answer: '$150,000', answer_type: 'text' },
      { question_key: 'work_auth', question_label: 'Authorized to work?', answer: 'Yes', answer_type: 'boolean' },
      { question_key: 'blank_ans', question_label: 'x', answer: '   ', answer_type: 'text' },
      { question_key: '', question_label: 'y', answer: 'z', answer_type: 'text' },
    ])
    // Blank-answer and keyless rows are dropped.
    expect(entries.map((e) => e.questionKey)).toEqual(['sf_years', 'desired_salary', 'work_auth'])

    const sf = entries.find((e) => e.questionKey === 'sf_years')
    expect(sf?.sensitive).toBe(false)
    expect(sf?.aliases).toContain('salesforce experience')

    // SENSITIVE_KEYS govern the review-gate: salary + work-auth never auto-fill (BR-156).
    expect(entries.find((e) => e.questionKey === 'desired_salary')?.sensitive).toBe(true)
    expect(entries.find((e) => e.questionKey === 'work_auth')?.sensitive).toBe(true)
  })

  it('normalizes answer_type to the typed union (unknown → text)', () => {
    const out = toAnswerEntries([
      { question_key: 'a', question_label: 'a', answer: 'Yes', answer_type: 'boolean' },
      { question_key: 'b', question_label: 'b', answer: 'X', answer_type: 'select' },
      { question_key: 'c', question_label: 'c', answer: 'X', answer_type: 'textarea' },
      { question_key: 'd', question_label: 'd', answer: 'X', answer_type: 'mystery' },
      { question_key: 'e', question_label: 'e', answer: 'X', answer_type: null },
    ])
    expect(out.map((e) => e.answerType)).toEqual(['boolean', 'select', 'textarea', 'text', 'text'])
  })
})
