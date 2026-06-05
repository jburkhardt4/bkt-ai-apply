export interface IngestionDraftJob {
  rowNumber: number
  sourceUrl: string
  title: string
  location?: string
  description?: string
  source?: string
  remoteType?: 'remote' | 'hybrid' | 'onsite'
  applicationMethod?: 'api' | 'manual' | 'ats'
}

export interface IngestionCsvIssue {
  rowNumber: number
  reason: string
}

export interface ParseIngestionCsvResult {
  rows: IngestionDraftJob[]
  issues: IngestionCsvIssue[]
}

interface DedupableBySourceUrl {
  rowNumber: number
  sourceUrl: string
}

export interface DedupedBySourceUrlResult<T extends DedupableBySourceUrl> {
  uniqueRows: T[]
  duplicateRows: T[]
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeSourceUrl(value: string): string {
  return value.trim()
}

function normalizeRemoteType(value: string | undefined): IngestionDraftJob['remoteType'] {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'remote' || normalized === 'hybrid' || normalized === 'onsite') {
    return normalized
  }
  return undefined
}

function normalizeApplicationMethod(value: string | undefined): IngestionDraftJob['applicationMethod'] {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'api' || normalized === 'manual' || normalized === 'ats') {
    return normalized
  }
  return undefined
}

function readCsvColumn(headers: string[], row: string[], aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const index = headers.indexOf(alias)
    if (index >= 0) {
      return row[index]
    }
  }
  return undefined
}

export function sourceUrlDedupKey(sourceUrl: string): string {
  return sourceUrl.trim().toLowerCase()
}

export function dedupeBySourceUrl<T extends DedupableBySourceUrl>(
  rows: T[],
): DedupedBySourceUrlResult<T> {
  const seen = new Set<string>()
  const uniqueRows: T[] = []
  const duplicateRows: T[] = []

  for (const row of rows) {
    const dedupKey = sourceUrlDedupKey(row.sourceUrl)
    if (!dedupKey) {
      duplicateRows.push(row)
      continue
    }

    if (seen.has(dedupKey)) {
      duplicateRows.push(row)
      continue
    }

    seen.add(dedupKey)
    uniqueRows.push(row)
  }

  return { uniqueRows, duplicateRows }
}

export function parseIngestionCsv(csvText: string): ParseIngestionCsvResult {
  const normalizedText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  if (!normalizedText) {
    return {
      rows: [],
      issues: [{ rowNumber: 1, reason: 'CSV file is empty.' }],
    }
  }

  const lines = normalizedText.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return {
      rows: [],
      issues: [{ rowNumber: 1, reason: 'CSV file is empty.' }],
    }
  }

  const headers = parseCsvLine(lines[0]).map((value) => normalizeHeader(value))

  const rows: IngestionDraftJob[] = []
  const issues: IngestionCsvIssue[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const rowNumber = i + 1
    const values = parseCsvLine(lines[i])

    const rawSourceUrl = readCsvColumn(headers, values, ['source_url', 'sourceurl', 'url'])
    const rawTitle = readCsvColumn(headers, values, ['title', 'job_title'])

    if (!rawSourceUrl?.trim() || !rawTitle?.trim()) {
      issues.push({
        rowNumber,
        reason: 'Missing required columns source_url or title.',
      })
      continue
    }

    rows.push({
      rowNumber,
      sourceUrl: normalizeSourceUrl(rawSourceUrl),
      title: rawTitle.trim(),
      location: normalizeOptional(readCsvColumn(headers, values, ['location'])),
      description: normalizeOptional(readCsvColumn(headers, values, ['description'])),
      source: normalizeOptional(readCsvColumn(headers, values, ['source'])),
      remoteType: normalizeRemoteType(readCsvColumn(headers, values, ['remote_type', 'remotetype'])),
      applicationMethod: normalizeApplicationMethod(
        readCsvColumn(headers, values, ['application_method', 'applicationmethod']),
      ),
    })
  }

  return { rows, issues }
}
