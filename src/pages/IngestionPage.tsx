import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Upload, PlusCircle, Inbox } from 'lucide-react'
import { useAuth } from '../contexts/auth-context'
import {
  parseCsvIngestionText,
  runIngestion,
  runScoreForJob,
  type IngestionResultRow,
  type ScoreRunResult,
} from '../features/applications/services/ingestionService'
import type { IngestionDraftJob } from '../features/applications/services/ingestionCsv'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

interface DisplayRow extends IngestionResultRow {
  score?: ScoreRunResult
  scoreError?: string
  scoring?: boolean
}

function statusVariant(status: IngestionResultRow['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'inserted') return 'default'
  if (status === 'duplicate') return 'secondary'
  return 'destructive'
}

function statusClass(status: IngestionResultRow['status']): string {
  if (status === 'inserted') return 'bg-green-600 text-white hover:bg-green-600'
  if (status === 'duplicate') return 'bg-yellow-500 text-white hover:bg-yellow-500'
  return ''
}

function labelText(label: ScoreRunResult['label']): string {
  if (label === 'auto_submit_prep') return 'auto_submit_prep'
  if (label === 'consideration') return 'consideration'
  return 'reject'
}

export default function IngestionPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [csvRows, setCsvRows] = useState<IngestionDraftJob[]>([])
  const [csvIssues, setCsvIssues] = useState<Array<{ rowNumber: number; reason: string }>>([])
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [manualSourceUrl, setManualSourceUrl] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const summary = useMemo(() => ({
    inserted: rows.filter((r) => r.status === 'inserted').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  }), [rows])

  async function processCsvFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseCsvIngestionText(text)
      setCsvRows(parsed.rows)
      setCsvIssues(parsed.issues)
      setSelectedFileName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read CSV file')
    } finally {
      setBusy(false)
    }
  }

  async function handleCsvFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) await processCsvFile(file)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void processCsvFile(file)
  }

  async function handleRunCsvIngestion() {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      const result = await runIngestion({ userId, rows: csvRows, sourceFallback: 'csv_upload' })
      const issueRows: DisplayRow[] = csvIssues.map((issue) => ({
        rowNumber: issue.rowNumber, sourceUrl: '', title: 'Invalid row', status: 'failed', message: issue.reason,
      }))
      setRows([...result.results, ...issueRows].sort((a, b) => a.rowNumber - b.rowNumber))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingestion failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleManualIngestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      const manualRow: IngestionDraftJob = {
        rowNumber: 1,
        sourceUrl: manualSourceUrl.trim(),
        title: manualTitle.trim(),
        location: manualLocation.trim() || undefined,
        description: manualDescription.trim() || undefined,
        source: 'manual_entry',
        applicationMethod: 'manual',
      }
      const result = await runIngestion({ userId, rows: [manualRow], sourceFallback: 'manual_entry' })
      setRows(result.results)
      setManualSourceUrl('')
      setManualTitle('')
      setManualLocation('')
      setManualDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual ingestion failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleScore(row: DisplayRow) {
    if (!userId || !row.jobId) return
    setRows((curr) => curr.map((item) => item.rowNumber === row.rowNumber ? { ...item, scoring: true, scoreError: undefined } : item))
    try {
      const score = await runScoreForJob({ userId, jobId: row.jobId, applicationId: row.applicationId })
      setRows((curr) => curr.map((item) => item.rowNumber === row.rowNumber ? { ...item, scoring: false, score } : item))
    } catch (err) {
      setRows((curr) => curr.map((item) => item.rowNumber === row.rowNumber ? { ...item, scoring: false, scoreError: err instanceof Error ? err.message : 'Scoring failed' } : item))
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">BKT AI-Apply</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
          Job Ingestion
        </h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* CSV Upload */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Upload className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                  CSV Upload
                </CardTitle>
                <CardDescription className="text-xs">Required columns: source_url, title</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
              onClick={() => document.getElementById('csv-file-input')?.click()}
            >
              <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {selectedFileName ?? 'Drop CSV here or click to browse'}
              </p>
              {selectedFileName ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {csvRows.length} rows · {csvIssues.length} issues
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">.csv files only</p>
              )}
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => void handleCsvFileSelect(e)}
                disabled={busy}
              />
            </div>

            <Button
              onClick={() => void handleRunCsvIngestion()}
              disabled={busy || (csvRows.length === 0 && csvIssues.length === 0)}
              className="w-full gap-1.5"
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Running…' : 'Run CSV Ingestion'}
            </Button>
          </CardContent>
        </Card>

        {/* Manual entry */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <PlusCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                  Manual Single Job
                </CardTitle>
                <CardDescription className="text-xs">Enter job details directly</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleManualIngestion(e)} className="space-y-2.5">
              <Input
                value={manualSourceUrl}
                onChange={(e) => setManualSourceUrl(e.target.value)}
                placeholder="source_url (required)"
                required
                className="text-sm"
              />
              <Input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="title (required)"
                required
                className="text-sm"
              />
              <Input
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                placeholder="location (optional)"
                className="text-sm"
              />
              <Textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="description (optional)"
                rows={3}
                className="resize-y text-sm"
              />
              <Button type="submit" disabled={busy} className="w-full gap-1.5">
                <PlusCircle className="h-4 w-4" />
                {busy ? 'Submitting…' : 'Ingest Job'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
                Ingestion Results
              </CardTitle>
            </div>
            {rows.length > 0 && (
              <div className="flex gap-2">
                <Badge className="bg-green-600 text-white hover:bg-green-600 text-xs">
                  {summary.inserted} inserted
                </Badge>
                <Badge className="bg-yellow-500 text-white hover:bg-yellow-500 text-xs">
                  {summary.duplicate} duplicate
                </Badge>
                <Badge variant="destructive" className="text-xs">
                  {summary.failed} failed
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No results yet. Run ingestion above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr>
                    {['Row', 'Title', 'Source URL', 'Status', 'Message', 'Score', 'Action'].map((h) => (
                      <th
                        key={h}
                        className="border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.sourceUrl || row.title}`}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 font-medium">{row.title}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">{row.sourceUrl || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge className={statusClass(row.status)} variant={statusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{row.message}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.score
                          ? `${row.score.overallScore} · ${labelText(row.score.label)}`
                          : row.scoreError ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleScore(row)}
                          disabled={!row.jobId || row.scoring}
                          className="h-7 text-xs"
                        >
                          {row.scoring ? 'Scoring…' : 'Score'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">
                {rows.length} total rows processed.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
