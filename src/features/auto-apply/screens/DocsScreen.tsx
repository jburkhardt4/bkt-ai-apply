// BKT AI-Apply — DocsHome: Resumes / Cover Letters home (history list +
// drag-and-drop upload), orchestrating the PreviewModal and DocBuilder views.
// Ported 1:1 from the design-system UI kit (DocsScreen.jsx).
import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import type { BktBadgeTone } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { formatStamp } from '@/components/bkt/format'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, DocsData, LetterContent, ResumeContent } from '../types'
import { PreviewModal } from './DocPaper'
import type { DocContent, DocType } from './DocPaper'
import { DocBuilder } from './DocBuilder'
import type { AiTargetJob } from './DocAssistant'
import { transcribeResume } from '../services/docContentParser'

/** True when a file's bytes read as plain text (not a PDF/DOCX binary), so its
 *  content can be transcribed directly. PDF/DOCX resumes need the paste-text path
 *  (no client-side extractor — see DocsScreen notes). */
function looksLikeText(s: string): boolean {
  const t = s.trim()
  if (t.length < 30) return false
  if (t.startsWith('%PDF') || t.startsWith('PK')) return false
  const printable = s.replace(/[^ -~\s]/g, '')
  return printable.length / s.length > 0.85
}

const DOC_COPY: Record<DocType, { title: string; newLabel: string; desc: string; drop: string; hint: string }> = {
  resume: {
    title: 'Resumes',
    newLabel: 'New Resume',
    desc: 'Your base resume plus every customized version Auto Apply has generated. Drop a file below or build one from scratch.',
    drop: 'Drag & drop a resume here',
    hint: 'PDF or DOCX, up to 10 MB — or click to browse',
  },
  letter: {
    title: 'Cover Letters',
    newLabel: 'New Cover Letter',
    desc: 'Base and tailored cover letters. Drop a file below, or let the builder draft one against a saved job.',
    drop: 'Drag & drop a cover letter here',
    hint: 'PDF or DOCX, up to 10 MB — or click to browse',
  },
}

const KIND_TONE: Record<string, BktBadgeTone> = { Base: 'brand', Customized: 'info', Archived: 'neutral' }

/* ---- drag-and-drop upload zone with simulated progress ---- */
function UploadZone({ copy, onUploaded }: { copy: (typeof DOC_COPY)['resume']; onUploaded: (name: string, text: string) => void }) {
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reads the file's bytes as text (so a .txt/.md resume can be transcribed
  // directly), then runs the progress animation and hands the name + text up.
  const start = async (file: File | null) => {
    const name = file?.name ?? 'Uploaded_Resume.pdf'
    let text = ''
    try {
      if (file) text = await file.text()
    } catch {
      text = ''
    }
    setFileName(name)
    setProgress(0)
    const t0 = performance.now()
    const tick = () => {
      const p = Math.min(100, ((performance.now() - t0) / 1100) * 100)
      setProgress(p)
      if (p < 100) requestAnimationFrame(tick)
      else
        setTimeout(() => {
          setProgress(null)
          onUploaded(name, text)
        }, 250)
    }
    requestAnimationFrame(tick)
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
        accept=".pdf,.doc,.docx"
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
  onPreview,
  onEdit,
  onAlign,
  onDelete,
  onToast,
}: {
  item: DocItem
  dateOrder: 'dmy' | 'mdy'
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
        <RowAction name="pencil" label="Open in Builder" onClick={() => onEdit(item)} />
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
  const seed = type === 'resume' ? docs.resumes : docs.letters
  const [items, setItems] = useState<DocItem[]>(seed)
  const [previewItem, setPreviewItem] = useState<DocItem | null>(null)
  const [builder, setBuilder] = useState<{ item: DocItem | null; autoAlign?: boolean; content?: DocContent } | null>(null)
  const [paste, setPaste] = useState<{ open: boolean; text: string }>({ open: false, text: '' })

  const templateOf = (item: DocItem) => docs.templates.find((t) => t.id === item.template) ?? docs.templates[0]!
  const contentOf = (item: DocItem): DocContent => {
    if (type === 'resume') {
      const base: ResumeContent = docs.resumeContent
      return item.summary ? { ...base, summary: item.summary } : base
    }
    const base: LetterContent = docs.letterContent
    return {
      ...base,
      company: item.company || base.company,
      role: item.role || base.role,
      recipient: item.recipient || base.recipient,
      greeting: `Dear ${item.recipient || base.recipient},`,
      body: item.body0 ? [item.body0, ...base.body.slice(1)] : base.body,
    }
  }

  const upload = (name: string, text: string) => {
    const now = new Date()
    const stamp = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US')}`
    setItems((xs) => [
      {
        id: 'u' + Date.now(),
        name,
        kind: 'Base',
        updated: stamp,
        size: `${150 + Math.round(Math.random() * 80)} KB`,
        template: 'classic',
        note: 'Uploaded just now',
      },
      ...xs,
    ])
    // TRANSCRIBE (not rewrite): when the resume's text is readable, parse it
    // verbatim into the structured builder. PDF/DOCX read as binary → steer the
    // user to the paste box (no client-side PDF extractor yet).
    if (type === 'resume' && looksLikeText(text)) {
      setBuilder({ item: null, content: transcribeResume(text) })
      onToast(`Transcribed ${name} into the builder`, 'circle-check', 'var(--bkt-success)')
      return
    }
    if (type === 'resume' && text && !looksLikeText(text)) {
      setPaste((p) => ({ ...p, open: true }))
      onToast(`Couldn't read text from ${name} — paste your resume below to transcribe`, 'circle-alert', 'var(--bkt-blue-300)')
      return
    }
    onToast(`Uploaded ${name}`, 'circle-check', 'var(--bkt-success)')
  }

  // Transcribe pasted resume text verbatim into the builder (reliable for the
  // PDF / Word content a user copies in — no rewrite).
  const transcribePasted = () => {
    const text = paste.text.trim()
    if (text.length < 30) {
      onToast('Paste your resume text to transcribe', 'circle-alert', 'var(--bkt-blue-300)')
      return
    }
    setBuilder({ item: null, content: transcribeResume(text) })
    setPaste({ open: false, text: '' })
    onToast('Transcribed your resume into the builder', 'circle-check', 'var(--bkt-success)')
  }
  const del = (item: DocItem) => {
    setItems((xs) => xs.filter((x) => x.id !== item.id))
    onToast(`Deleted ${item.name}`, 'trash-2', 'var(--bkt-zinc-300)')
  }

  if (builder) {
    return (
      <DocBuilder
        type={type}
        docs={docs}
        item={builder.item}
        autoAlign={builder.autoAlign}
        initialContent={builder.content ?? (builder.item ? contentOf(builder.item) : type === 'resume' ? docs.resumeContent : docs.letterContent)}
        userId={userId}
        lastJob={lastJob}
        aiVariant={aiVariant}
        onToast={onToast}
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
          onClick={() => setBuilder({ item: items.find((i) => i.isDefault) ?? items[0] ?? null, autoAlign: true })}
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
              {paste.open ? 'Hide paste box' : 'Or paste your resume text — transcribed verbatim (best for PDF / Word)'}
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
                onPreview={setPreviewItem}
                onEdit={(it) => setBuilder({ item: it })}
                onAlign={(it) => setBuilder({ item: it, autoAlign: true })}
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
        content={previewItem ? contentOf(previewItem) : null}
        template={previewItem ? templateOf(previewItem) : null}
        onClose={() => setPreviewItem(null)}
        onEdit={(it) => {
          setPreviewItem(null)
          setBuilder({ item: it })
        }}
        onToast={onToast}
      />
    </div>
  )
}
