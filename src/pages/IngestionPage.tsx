import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../contexts/auth-context'
import {
  parseCsvIngestionText,
  runIngestion,
  runScoreForJob,
  type IngestionResultRow,
  type ScoreRunResult,
} from '../features/applications/services/ingestionService'
import type { IngestionDraftJob } from '../features/applications/services/ingestionCsv'

interface DisplayRow extends IngestionResultRow {
  score?: ScoreRunResult
  scoreError?: string
  scoring?: boolean
}

function statusColor(status: IngestionResultRow['status']): string {
  if (status === 'inserted') return '#0c7c43'
  if (status === 'duplicate') return '#9a6700'
  return '#b42318'
}

function labelText(label: ScoreRunResult['label']): string {
  if (label === 'auto_submit_prep') return 'auto_submit_prep'
  if (label === 'consideration') return 'consideration'
  return 'reject'
}

export default function IngestionPage() {
  const { user, loading, signOut } = useAuth()
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

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
    }
  }, [loading, user])

  const summary = useMemo(() => {
    const inserted = rows.filter((row) => row.status === 'inserted').length
    const duplicate = rows.filter((row) => row.status === 'duplicate').length
    const failed = rows.filter((row) => row.status === 'failed').length
    return { inserted, duplicate, failed }
  }, [rows])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: 'var(--ink-subtle)',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!user) {
    return null
  }

  async function handleSignOut() {
    try {
      await signOut()
      window.location.href = '/login'
    } catch {
      window.location.href = '/login'
    }
  }

  async function handleCsvFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

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

  async function handleRunCsvIngestion() {
    if (!userId) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const result = await runIngestion({
        userId,
        rows: csvRows,
        sourceFallback: 'csv_upload',
      })

      const issueRows: DisplayRow[] = csvIssues.map((issue) => ({
        rowNumber: issue.rowNumber,
        sourceUrl: '',
        title: 'Invalid row',
        status: 'failed',
        message: issue.reason,
      }))

      const merged = [...result.results, ...issueRows].sort((a, b) => a.rowNumber - b.rowNumber)
      setRows(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingestion failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleManualIngestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) {
      return
    }

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

      const result = await runIngestion({
        userId,
        rows: [manualRow],
        sourceFallback: 'manual_entry',
      })

      setRows(result.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual ingestion failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleScore(row: DisplayRow) {
    if (!userId || !row.jobId) {
      return
    }

    setRows((current) =>
      current.map((item) => (item.rowNumber === row.rowNumber ? { ...item, scoring: true, scoreError: undefined } : item)),
    )

    try {
      const score = await runScoreForJob({
        userId,
        jobId: row.jobId,
        applicationId: row.applicationId,
      })

      setRows((current) =>
        current.map((item) =>
          item.rowNumber === row.rowNumber
            ? {
                ...item,
                scoring: false,
                score,
                scoreError: undefined,
              }
            : item,
        ),
      )
    } catch (err) {
      setRows((current) =>
        current.map((item) =>
          item.rowNumber === row.rowNumber
            ? {
                ...item,
                scoring: false,
                scoreError: err instanceof Error ? err.message : 'Scoring failed',
              }
            : item,
        ),
      )
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.25rem 3rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontSize: '0.7rem',
              color: 'var(--ink-subtle)',
              fontWeight: 700,
            }}
          >
            BKT AI-Apply
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
              margin: '0.2rem 0 0',
              color: 'var(--ink-strong)',
            }}
          >
            Job Ingestion
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => {
              window.location.href = '/'
            }}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            Pipeline
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-subtle)' }}>{user.email}</span>
          <button
            onClick={() => void handleSignOut()}
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.6rem',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <section
          style={{
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '1rem',
            background: 'var(--surface)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--ink-strong)' }}>CSV Upload (INT-009)</h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--ink-subtle)' }}>
            Required columns: source_url, title
          </p>

          <input type="file" accept=".csv,text/csv" onChange={(event) => void handleCsvFileSelect(event)} disabled={busy} />

          <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--ink-subtle)' }}>
            {selectedFileName ? `Loaded: ${selectedFileName}` : 'No file selected.'}
          </div>

          <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--ink-subtle)' }}>
            Parsed rows: {csvRows.length} | Parse issues: {csvIssues.length}
          </div>

          <button
            onClick={() => void handleRunCsvIngestion()}
            disabled={busy || (csvRows.length === 0 && csvIssues.length === 0)}
            style={{
              marginTop: '0.8rem',
              fontSize: '0.82rem',
              padding: '0.45rem 0.7rem',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              background: 'white',
              cursor: busy || (csvRows.length === 0 && csvIssues.length === 0) ? 'not-allowed' : 'pointer',
              color: 'var(--ink)',
            }}
          >
            {busy ? 'Running…' : 'Run CSV Ingestion'}
          </button>
        </section>

        <section
          style={{
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '1rem',
            background: 'var(--surface)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--ink-strong)' }}>Manual Single Job</h2>

          <form onSubmit={(event) => void handleManualIngestion(event)} style={{ display: 'grid', gap: '0.5rem' }}>
            <input
              value={manualSourceUrl}
              onChange={(event) => setManualSourceUrl(event.target.value)}
              placeholder="source_url"
              required
              style={{
                padding: '0.45rem 0.6rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
              }}
            />
            <input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              placeholder="title"
              required
              style={{
                padding: '0.45rem 0.6rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
              }}
            />
            <input
              value={manualLocation}
              onChange={(event) => setManualLocation(event.target.value)}
              placeholder="location (optional)"
              style={{
                padding: '0.45rem 0.6rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
              }}
            />
            <textarea
              value={manualDescription}
              onChange={(event) => setManualDescription(event.target.value)}
              placeholder="description (optional)"
              rows={3}
              style={{
                padding: '0.45rem 0.6rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
                resize: 'vertical',
              }}
            />

            <button
              type="submit"
              disabled={busy}
              style={{
                fontSize: '0.82rem',
                padding: '0.45rem 0.7rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                background: 'white',
                cursor: busy ? 'not-allowed' : 'pointer',
                color: 'var(--ink)',
              }}
            >
              {busy ? 'Submitting…' : 'Ingest Single Job'}
            </button>
          </form>
        </section>
      </div>

      {error && (
        <div
          style={{
            color: '#dc2626',
            marginBottom: '1rem',
            padding: '0.6rem 0.75rem',
            background: '#fef2f2',
            borderRadius: '8px',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          border: '1px solid var(--line)',
          borderRadius: '16px',
          padding: '1rem',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink-strong)' }}>Ingestion Results</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--ink-subtle)' }}>
            inserted {summary.inserted} | duplicates {summary.duplicate} | failed {summary.failed}
          </div>
        </div>

        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-subtle)' }}>No results yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Row</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Title</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>source_url</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Status</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Message</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Score</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--line)', padding: '0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.sourceUrl || row.title}`}>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>{row.rowNumber}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>{row.title}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>{row.sourceUrl || '—'}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem', color: statusColor(row.status), fontWeight: 600 }}>
                      {row.status}
                    </td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>{row.message}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>
                      {row.score
                        ? `${row.score.overallScore} | ${labelText(row.score.label)} | ${row.score.recommendation}`
                        : row.scoreError || '—'}
                    </td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '0.5rem', fontSize: '0.8rem' }}>
                      <button
                        onClick={() => void handleScore(row)}
                        disabled={!row.jobId || row.scoring}
                        style={{
                          fontSize: '0.76rem',
                          padding: '0.3rem 0.5rem',
                          border: '1px solid var(--line)',
                          borderRadius: '8px',
                          background: 'white',
                          cursor: !row.jobId || row.scoring ? 'not-allowed' : 'pointer',
                          color: 'var(--ink)',
                        }}
                      >
                        {row.scoring ? 'Scoring…' : 'Score Job'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
