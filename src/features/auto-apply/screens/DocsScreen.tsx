// BKT AI-Apply — DocsHome: Resumes / Cover Letters home (history list +
// drag-and-drop upload), orchestrating the PreviewModal and DocBuilder views.
// Ported 1:1 from the design-system UI kit (DocsScreen.jsx).
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import type { BktBadgeTone } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { formatBytes, formatStamp } from '@/components/bkt/format'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, DocsData } from '../types'
import { PreviewModal } from './DocPaper'
import type { DocContent, DocType } from './DocPaper'
import { DocBuilder } from './DocBuilder'
import type { AiTargetJob } from './DocAssistant'
import { transcribeLetter, transcribeResume } from '../services/docContentParser'
import { extractResumeText } from '../services/resumeFileExtractor'
import type { ResumeFileKind } from '../services/resumeFileExtractor'
import {
  deleteDocument,
  listDocuments,
  uploadDocumentFile,
} from '../../applications/services/documentStorageService'
import type { LoadedDocument } from '../../applications/services/documentStorageService'

/** Result of reading an uploaded file: the original File (stored verbatim) plus
 *  the extracted text (with its detected kind) or a user-facing error message. */
interface UploadResult {
  file: File
  name: string
  size: number
  text: string
  kind: ResumeFileKind | null
  error?: string
}

const DOC_COPY: Record<DocType, { title: string; newLabel: string; desc: string; drop: string; hint: string }> = {
  resume: {
    title: 'Resumes',
    newLabel: 'New Resume',
    desc: 'Your base resume plus every customized version Auto Apply has generated. Drop a file below or build one from scratch.',
    drop: 'Drag & drop a resume here',
    hint: 'PDF, DOCX, TXT, or MD, up to 10 MB — or click to browse',
  },
  letter: {
    title: 'Cover Letters',
    newLabel: 'New Cover Letter',
    desc: 'Base and tailored cover letters. Drop a file below, or let the builder draft one against a saved job.',
    drop: 'Drag & drop a cover letter here',
    hint: 'PDF, DOCX, TXT, or MD, up to 10 MB — or click to browse',
  },
}

const KIND_TONE: Record<string, BktBadgeTone> = { Base: 'brand', Customized: 'info', Archived: 'neutral' }

/* ---- drag-and-drop upload zone with real multi-format extraction ---- */
function UploadZone({ copy, onUploaded }: { copy: (typeof DOC_COPY)['resume']; onUploaded: (result: UploadResult) => void }) {
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Extracts the file's real text (PDF/DOCX/TXT/MD via resumeFileExtractor) while
  // a progress bar animates to 95%; once both finish it jumps to 100% and hands
  // the extracted text (or a friendly error) up to the parent.
  const start = async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setProgress(0)
    const t0 = performance.now()
    const [extraction] = await Promise.all([
      extractResumeText(file).then(
        (r): UploadResult => ({ file, name: file.name, size: file.size, text: r.text, kind: r.kind }),
        (e: unknown): UploadResult => ({
          file,
          name: file.name,
          size: file.size,
          text: '',
          kind: null,
          error: e instanceof Error ? e.message : 'Could not read this file.',
        }),
      ),
      new Promise<void>((resolve) => {
        const tick = () => {
          const p = Math.min(95, ((performance.now() - t0) / 1000) * 95)
          setProgress(p)
          if (p < 95) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      }),
    ])
    setProgress(100)
    setTimeout(() => {
      setProgress(null)
      onUploaded(extraction)
    }, 220)
  }

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        const f = (e.dataTransfer.files && e.dataTransfer.files[0]) ?? null
        void start(f)
      }}
      onClick={() => progress == null && inputRef.current && inputRef.current.click()}
      className={progress == null ? 'bkt-press' : ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 22px',
        cursor: progress == null ? 'pointer' : 'default',
        border: `1.5px dashed ${over ? 'var(--primary)' : 'color-mix(in oklab, var(--primary) 32%, var(--border))'}`,
        background: over ? 'var(--bkt-blue-50)' : 'color-mix(in oklab, var(--bkt-blue-50) 36%, var(--surface))',
        borderRadius: 'var(--radius-xl)',
        transition: 'background var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown"
        style={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files && e.target.files[0]
          if (f) void start(f)
          e.target.value = ''
        }}
      />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          flexShrink: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--primary)',
        }}
      >
        <Icon name={progress == null ? 'upload' : 'loader-circle'} size={19} style={progress != null ? { animation: 'bkt-spin 0.9s linear infinite' } : undefined} />
      </span>
      {progress == null ? (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: '600 var(--text-base)/1.2 var(--font-body)', color: 'var(--text-strong)' }}>{copy.drop}</span>
          <span style={{ font: '400 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-muted)' }}>{copy.hint}</span>
        </span>
      ) : (
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', font: '600 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}>
            <span>{fileName}</span>
            <span className="bkt-num" style={{ color: 'var(--text-muted)' }}>
              {Math.round(progress)}%
            </span>
          </span>
          <span style={{ height: 5, background: 'var(--bkt-zinc-200)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: 'var(--radius-pill)' }}></span>
          </span>
        </span>
      )}
    </div>
  )
}

/* ---- one history row ---- */
function RowAction({ name, label, onClick, danger = false }: { name: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="bkt-press"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        color: danger ? 'var(--bkt-danger)' : 'var(--bkt-zinc-500)',
        transition: 'background var(--dur-fast) var(--ease-standard)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--bkt-danger-soft)' : 'var(--bkt-zinc-100)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon name={name} size={15} />
    </button>
  )
}

function DocRow({
  item,
  dateOrder,
  builderLabel,
  onPreview,
  onEdit,
  onAlign,
  onDelete,
  onToast,
}: {
  item: DocItem
  dateOrder: 'dmy' | 'mdy'
  builderLabel: string
  onPreview: (item: DocItem) => void
  onEdit: (item: DocItem) => void
  onAlign: (item: DocItem) => void
  onDelete: (item: DocItem) => void
  onToast: ToastFn
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={() => onPreview(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 18px',
        cursor: 'pointer',
        background: hover ? 'var(--bkt-slate-50)' : 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        transition: 'background var(--dur-fast) var(--ease-standard)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          flexShrink: 0,
          background: 'var(--bkt-blue-50)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--primary)',
        }}
      >
        <Icon name="file-text" size={17} />
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ font: '600 var(--text-base)/1.2 var(--font-body)', color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
          {item.isDefault && (
            <BktBadge tone="success" appearance="soft">
              Default
            </BktBadge>
          )}
          <BktBadge tone={KIND_TONE[item.kind] ?? 'neutral'} appearance="soft">
            {item.kind}
          </BktBadge>
        </span>
        <span style={{ font: '400 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.target || item.note || 'General purpose'}
        </span>
      </span>

      <span style={{ font: '400 var(--text-sm)/1 var(--font-stamp, var(--font-mono))', color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>
        {formatStamp(item.updated, dateOrder)}
      </span>
      <span className="bkt-num" style={{ width: 64, textAlign: 'right', font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}>
        {item.size}
      </span>

      <span style={{ display: 'flex', gap: 2, opacity: hover ? 1 : 0, transition: 'opacity var(--dur-fast) var(--ease-standard)' }}>
        <RowAction name="eye" label="Preview" onClick={() => onPreview(item)} />
        <RowAction name="wand-sparkles" label="Auto-Align to Last Job" onClick={() => onAlign(item)} />
        <RowAction name="pencil" label={builderLabel} onClick={() => onEdit(item)} />
        <RowAction name="download" label="Download" onClick={() => onToast(`Downloading ${item.name}`, 'download', 'var(--bkt-blue-300)')} />
        <RowAction name="trash-2" label="Delete" danger onClick={() => onDelete(item)} />
      </span>
    </div>
  )
}

/* ---- home view: header + upload + list, swapping to builder ---- */
export interface DocsHomeProps {
  type: DocType
  docs: DocsData
  /** Authenticated user id — enables real LLM generation in the builder. */
  userId: string | null
  lastJob: AiTargetJob
  dateOrder?: 'dmy' | 'mdy'
  aiVariant?: 'rail' | 'floating'
  onToast: ToastFn
}

export function DocsHome({ type, docs, userId, lastJob, dateOrder = 'mdy', aiVariant = 'rail', onToast }: DocsHomeProps) {
  const copy = DOC_COPY[type]
  const docType = type === 'resume' ? 'resume' : 'cover_letter'
  const [items, setItems] = useState<DocItem[]>([])
  const [previewItem, setPreviewItem] = useState<DocItem | null>(null)
  const [builder, setBuilder] = useState<{ item: DocItem | null; autoAlign?: boolean; content?: DocContent } | null>(null)
  const [paste, setPaste] = useState<{ open: boolean; text: string }>({ open: false, text: '' })

  /** Maps a real stored document to a history row. Display name = the actual
   *  uploaded filename; falls back to the first text line / a version label. */
  const toItem = (d: LoadedDocument): DocItem => {
    const firstLine = d.text.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? ''
    return {
      id: d.documentId,
      name: d.fileName || firstLine || `${type === 'resume' ? 'Resume' : 'Cover letter'} v${d.version}`,
      kind: 'Base',
      updated: d.createdAt,
      size: formatBytes(d.text.length),
      template: 'classic',
      note: d.fileName ? 'Uploaded file' : `Version ${d.version}`,
      rawText: d.text,
      documentId: d.documentId,
      storagePath: d.storagePath,
      version: d.version,
      fileName: d.fileName ?? undefined,
      mimeType: d.mimeType ?? undefined,
      originalPath: d.originalPath ?? undefined,
    }
  }

  /** Refreshes the real document list from Supabase (no-op without auth). */
  const reload = () => {
    if (!userId) return
    listDocuments(userId, docType)
      .then((docs) => setItems(docs.map(toItem)))
      .catch(() => {})
  }

  // Initial load — setState only inside the promise callback (no synchronous
  // setState in an effect); demo/no-auth resolves to an empty list (no seed).
  useEffect(() => {
    let active = true
    const load = userId ? listDocuments(userId, docType) : Promise.resolve([] as LoadedDocument[])
    load.then((docs) => { if (active) setItems(docs.map(toItem)) }).catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, docType])

  // Opens a doc in the builder. Real docs are transcribed into sections HERE
  // (lazily, on open) from their stored text — never on upload/preview.
  const openInBuilder = (item: DocItem | null, autoAlign = false) => {
    const content = item?.rawText
      ? type === 'resume'
        ? transcribeResume(item.rawText)
        : transcribeLetter(item.rawText)
      : undefined
    setBuilder({ item, content, autoAlign })
  }

  // Upload STORES THE ACTUAL FILE (original binary + extracted text) to the
  // `documents` table and refreshes the list — the file is viewable as-is and its
  // text feeds job-scoring. It never auto-parses into the builder.
  const upload = (result: UploadResult) => {
    if (!userId) {
      onToast('Sign in to save uploaded documents', 'circle-alert', 'var(--bkt-warning)')
      return
    }
    uploadDocumentFile({ userId, documentType: docType, file: result.file, extractedText: result.text })
      .then(() => {
        reload()
        const note = result.text ? 'open it to preview or edit' : 'preview it (text could not be extracted)'
        onToast(`Uploaded ${result.name} — ${note}`, 'circle-check', 'var(--bkt-success)')
      })
      .catch(() => onToast(`Couldn't save ${result.name}`, 'circle-x', 'var(--bkt-danger)'))
  }

  // Transcribe pasted text into a NEW builder doc (edits autosave durably).
  const transcribePasted = () => {
    const text = paste.text.trim()
    if (text.length < 30) {
      onToast('Paste your resume text to transcribe', 'circle-alert', 'var(--bkt-blue-300)')
      return
    }
    setBuilder({ item: null, content: transcribeResume(text) })
    setPaste({ open: false, text: '' })
    onToast('Transcribed into the builder — edits save automatically', 'circle-check', 'var(--bkt-success)')
  }

  const del = (item: DocItem) => {
    if (userId && item.documentId && item.storagePath) {
      deleteDocument({
        userId,
        documentId: item.documentId,
        storagePath: item.storagePath,
        originalPath: item.originalPath,
      })
        .then(() => {
          reload()
          onToast(`Deleted ${item.name}`, 'trash-2', 'var(--bkt-zinc-300)')
        })
        .catch(() => onToast(`Couldn't delete ${item.name}`, 'circle-x', 'var(--bkt-danger)'))
      return
    }
    setItems((xs) => xs.filter((x) => x.id !== item.id))
    onToast(`Removed ${item.name}`, 'trash-2', 'var(--bkt-zinc-300)')
  }

  if (builder) {
    return (
      <DocBuilder
        type={type}
        docs={docs}
        item={builder.item}
        autoAlign={builder.autoAlign}
        initialContent={builder.content ?? (type === 'resume' ? docs.resumeContent : docs.letterContent)}
        userId={userId}
        lastJob={lastJob}
        aiVariant={aiVariant}
        onToast={onToast}
        onSaved={reload}
        onBack={() => setBuilder(null)}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <h1 style={{ margin: 0, font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', color: 'var(--text-strong)' }}>
            {copy.title}
          </h1>
          <p style={{ margin: 0, font: '400 var(--text-sm)/1.55 var(--font-body)', color: 'var(--text-muted)', maxWidth: 760 }}>{copy.desc}</p>
        </div>
        <BktButton
          variant="outline"
          size="md"
          iconLeft={<Icon name="wand-sparkles" size={15} color="var(--primary)" />}
          onClick={() => openInBuilder(items.find((i) => i.isDefault) ?? items[0] ?? null, true)}
        >
          Auto-Align to Last Job
        </BktButton>
        <BktButton variant="primary" size="md" iconLeft={<Icon name="plus" size={15} />} onClick={() => setBuilder({ item: null })}>
          {copy.newLabel}
        </BktButton>
      </div>

      <div className="bkt-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '18px 28px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="bkt-enter">
          <UploadZone copy={copy} onUploaded={upload} />
        </div>

        {type === 'resume' && (
          <div className="bkt-enter" style={{ display: 'flex', flexDirection: 'column', gap: paste.open ? 10 : 0 }}>
            <button
              onClick={() => setPaste((p) => ({ ...p, open: !p.open }))}
              className="bkt-press"
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 0',
                font: '600 var(--text-sm)/1 var(--font-body)',
                color: 'var(--primary)',
              }}
            >
              <Icon name="file-text" size={14} />
              {paste.open ? 'Hide paste box' : 'Or paste your resume text — transcribed verbatim (a fallback if a file will not read)'}
            </button>
            {paste.open && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={paste.text}
                  onChange={(e) => setPaste((p) => ({ ...p, text: e.target.value }))}
                  rows={8}
                  placeholder="Paste your resume here — it is transcribed into the builder verbatim, not rewritten."
                  className="bkt-scroll"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    padding: '11px 13px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    font: '400 var(--text-sm)/1.5 var(--font-body)',
                    color: 'var(--text-strong)',
                    outline: 'none',
                  }}
                />
                <BktButton variant="primary" size="md" iconLeft={<Icon name="check" size={15} />} onClick={transcribePasted} style={{ alignSelf: 'flex-start' }}>
                  Transcribe to builder
                </BktButton>
              </div>
            )}
          </div>
        )}

        <div className="bkt-enter" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 18px',
              borderBottom: '1px solid var(--border)',
              font: '600 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-muted)',
            }}
          >
            History
            <span className="bkt-num" style={{ font: '500 var(--text-xs)/1 var(--font-mono)', background: 'var(--bkt-zinc-100)', borderRadius: 'var(--radius-pill)', padding: '3px 8px' }}>
              {items.length}
            </span>
          </div>
          <div className="bkt-stagger-rows">
            {items.map((item) => (
              <DocRow
                key={item.id}
                item={item}
                dateOrder={dateOrder}
                builderLabel={type === 'resume' ? 'Open Resume Builder' : 'Open in Builder'}
                onPreview={setPreviewItem}
                onEdit={(it) => openInBuilder(it)}
                onAlign={(it) => openInBuilder(it, true)}
                onDelete={del}
                onToast={onToast}
              />
            ))}
          </div>
          {items.length === 0 && (
            <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--text-muted)', font: '400 var(--text-sm)/1.5 var(--font-body)' }}>
              Nothing here yet — drop a file above to get started.
            </div>
          )}
        </div>
      </div>

      <PreviewModal
        item={previewItem}
        type={type}
        text={previewItem?.rawText ?? ''}
        onClose={() => setPreviewItem(null)}
        onEdit={(it) => {
          setPreviewItem(null)
          openInBuilder(it)
        }}
        onToast={onToast}
      />
    </div>
  )
}
