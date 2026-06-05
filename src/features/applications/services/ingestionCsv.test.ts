import { describe, expect, it } from 'vitest'
import { dedupeBySourceUrl, parseIngestionCsv } from './ingestionCsv'

describe('parseIngestionCsv', () => {
  it('parses required and optional columns including quoted values', () => {
    const csv = [
      'source_url,title,location,description,source,remote_type,application_method',
      'https://jobs.example.com/1,"Senior, RevOps Engineer",Los Angeles,"Own pipeline, metrics",LinkedIn,remote,manual',
    ].join('\n')

    const result = parseIngestionCsv(csv)

    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      sourceUrl: 'https://jobs.example.com/1',
      title: 'Senior, RevOps Engineer',
      location: 'Los Angeles',
      description: 'Own pipeline, metrics',
      source: 'LinkedIn',
      remoteType: 'remote',
      applicationMethod: 'manual',
    })
  })

  it('reports issues for rows missing required columns', () => {
    const csv = ['source_url,title', 'https://jobs.example.com/1,', ',Missing URL'].join('\n')

    const result = parseIngestionCsv(csv)

    expect(result.rows).toHaveLength(0)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0].rowNumber).toBe(2)
    expect(result.issues[1].rowNumber).toBe(3)
  })
})

describe('dedupeBySourceUrl', () => {
  it('deduplicates rows by normalized source_url', () => {
    const rows = [
      { rowNumber: 2, sourceUrl: 'https://jobs.example.com/1', title: 'A' },
      { rowNumber: 3, sourceUrl: ' https://jobs.example.com/1 ', title: 'B' },
      { rowNumber: 4, sourceUrl: 'https://jobs.example.com/2', title: 'C' },
      { rowNumber: 5, sourceUrl: 'HTTPS://JOBS.EXAMPLE.COM/2', title: 'D' },
    ]

    const deduped = dedupeBySourceUrl(rows)

    expect(deduped.uniqueRows).toHaveLength(2)
    expect(deduped.duplicateRows).toHaveLength(2)
    expect(deduped.uniqueRows.map((row) => row.title)).toEqual(['A', 'C'])
  })
})
