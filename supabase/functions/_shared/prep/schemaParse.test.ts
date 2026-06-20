import { describe, expect, it } from 'vitest'
import {
  parseAshbySchema,
  parseGreenhouseSchema,
  parseLeverSchema,
  parseSmartRecruitersSchema,
} from './schemaParse.ts'
import type { NormalizedField } from './types.ts'

/** Looks up a normalized field by canonical key. */
function byKey(fields: NormalizedField[], key: string): NormalizedField | undefined {
  return fields.find((f) => f.key === key)
}

describe('parseGreenhouseSchema', () => {
  // Job Board API /boards/{t}/jobs/{id}?questions=true
  const raw = {
    questions: [
      { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
      { label: 'Last Name', required: true, fields: [{ name: 'last_name', type: 'input_text' }] },
      { label: 'Email', required: true, fields: [{ name: 'email', type: 'input_text' }] },
      { label: 'Resume/CV', required: true, fields: [{ name: 'resume', type: 'input_file' }] },
      {
        label: 'Are you legally authorized to work?',
        required: true,
        fields: [
          {
            name: 'question_123',
            type: 'multi_value_single_select',
            values: [{ label: 'Yes', value: 1 }, { label: 'No', value: 0 }],
          },
        ],
      },
      {
        label: 'Why are you interested in this role?',
        required: false,
        fields: [{ name: 'question_456', type: 'textarea' }],
      },
    ],
  }

  it('normalizes standard fields by canonical key', () => {
    const fields = parseGreenhouseSchema(raw)
    expect(byKey(fields, 'first_name')?.required).toBe(true)
    expect(byKey(fields, 'email')).toBeDefined()
    expect(byKey(fields, 'resume')?.type).toBe('input_file')
  })

  it('marks the work-authorization question sensitive and captures options', () => {
    const fields = parseGreenhouseSchema(raw)
    const workAuth = byKey(fields, 'work_auth')
    expect(workAuth?.sensitive).toBe(true)
    expect(workAuth?.options).toEqual(['Yes', 'No'])
  })

  it('routes an unknown question to answer:<slug> as non-sensitive', () => {
    const fields = parseGreenhouseSchema(raw)
    const custom = byKey(fields, 'answer:why_are_you_interested_in_this_role')
    expect(custom).toBeDefined()
    expect(custom?.sensitive).toBe(false)
  })

  it('returns [] on empty/garbage input without throwing', () => {
    expect(parseGreenhouseSchema(null)).toEqual([])
    expect(parseGreenhouseSchema({})).toEqual([])
    expect(parseGreenhouseSchema({ questions: 'nope' })).toEqual([])
  })
})

describe('parseLeverSchema', () => {
  // /v0/postings/{site}/{id}?mode=json
  const raw = {
    text: 'Senior Engineer',
    customQuestions: [
      {
        fields: [
          { text: 'Expected salary', id: 'q_salary', type: 'text', required: true },
          { text: 'Why Lever?', id: 'q_why', type: 'textarea', required: false },
        ],
      },
    ],
  }

  it('synthesizes the standard lever fields', () => {
    const fields = parseLeverSchema(raw)
    expect(byKey(fields, 'full_name')).toBeDefined()
    expect(byKey(fields, 'email')?.required).toBe(true)
    expect(byKey(fields, 'resume')?.type).toBe('file')
  })

  it('marks an expected-salary custom question sensitive', () => {
    const fields = parseLeverSchema(raw)
    const salary = byKey(fields, 'answer:expected_salary')
    expect(salary?.sensitive).toBe(true)
  })

  it('keeps a benign custom question non-sensitive', () => {
    const fields = parseLeverSchema(raw)
    expect(byKey(fields, 'answer:why_lever')?.sensitive).toBe(false)
  })
})

describe('parseAshbySchema', () => {
  // posting-api jobPosting → applicationFormDefinition.sections[].fields[].field
  const raw = {
    applicationFormDefinition: {
      sections: [
        {
          fields: [
            { field: { path: 'name', label: 'Name', type: 'String', isRequired: true } },
            { field: { path: 'email', label: 'Email', type: 'Email', isRequired: true } },
            {
              field: {
                path: 'gender',
                label: 'Gender',
                type: 'ValueSelect',
                isRequired: false,
                selectableValues: [{ label: 'Male' }, { label: 'Female' }, { label: 'Decline' }],
              },
            },
          ],
        },
      ],
    },
  }

  it('normalizes name + email from sections', () => {
    const fields = parseAshbySchema(raw)
    expect(byKey(fields, 'full_name')?.required).toBe(true)
    expect(byKey(fields, 'email')).toBeDefined()
  })

  it('marks gender sensitive and captures selectable options', () => {
    const fields = parseAshbySchema(raw)
    const gender = byKey(fields, 'eeo_gender')
    expect(gender?.sensitive).toBe(true)
    expect(gender?.options).toEqual(['Male', 'Female', 'Decline'])
  })

  it('returns [] on shape drift without throwing', () => {
    expect(parseAshbySchema({ applicationFormDefinition: {} })).toEqual([])
    expect(parseAshbySchema(undefined)).toEqual([])
  })
})

describe('parseSmartRecruitersSchema', () => {
  // /postings/{id}/configuration → screeningQuestions + diversityQuestions
  const raw = {
    screeningQuestions: {
      questions: [
        { id: 's1', label: 'How many years of experience?', type: 'text', required: true },
        { id: 's2', label: 'Do you require sponsorship?', type: 'select', required: true },
      ],
    },
    diversityQuestions: [
      {
        id: 'd1',
        label: 'Veteran Status',
        type: 'select',
        answers: [{ label: 'Yes' }, { label: 'No' }],
      },
    ],
  }

  it('normalizes a benign screening question', () => {
    const fields = parseSmartRecruitersSchema(raw)
    expect(byKey(fields, 'answer:how_many_years_of_experience')?.sensitive).toBe(false)
  })

  it('marks sponsorship + diversity questions sensitive', () => {
    const fields = parseSmartRecruitersSchema(raw)
    expect(byKey(fields, 'requires_sponsorship')?.sensitive).toBe(true)
    expect(byKey(fields, 'eeo_veteran')?.sensitive).toBe(true)
  })

  it('returns [] on garbage without throwing', () => {
    expect(parseSmartRecruitersSchema(null)).toEqual([])
    expect(parseSmartRecruitersSchema({ screeningQuestions: {} })).toEqual([])
  })
})
