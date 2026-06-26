// BKT AI-Apply — DocPaper: renders a resume / cover letter as a real
// paper page (template-aware), plus the full-screen PreviewModal viewer.
// Ported 1:1 from the design-system UI kit (DocPaper.jsx).
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, LetterContent, PaperTemplate, ResumeContent } from '../types'
import { getSignedUrl } from '../../applications/services/documentStorageService'

export type DocType = 'resume' | 'letter'
export type DocContent = ResumeContent | LetterContent

export interface PaperFmt {
  fontSize?: number
  lineHeight?: number
}

function PaperHead({ t, children, size }: { t: PaperTemplate; children: ReactNode; size: number }) {
  return (
    <div
      style={{
        fontFamily: t.headFont,
        fontWeight: 700,
        color: t.accent,
        fontSize: size * 0.92,
        letterSpacing: t.headCase === 'uppercase' ? '0.08em' : '0.01em',
        textTransform: t.headCase,
        margin: '0 0 6px',
        borderBottom: t.rule ? `1px solid ${t.accent === '#101013' ? '#d4d4d8' : t.accent}` : 'none',
        paddingBottom: t.rule ? 4 : 0,
      }}
    >
      {children}
    </div>
  )
}

export function DocPaper({
  type,
  content,
  template: t,
  fmt = {},
  style = {},
}: {
  type: DocType
  content: DocContent
  template: PaperTemplate
  fmt?: PaperFmt
  style?: CSSProperties
}) {
  const fs = fmt.fontSize || 11
  const lh = fmt.lineHeight || 1.45
  const px = (pt: number) => pt * 1.45 // rough pt→px for screen
  const base: CSSProperties = {
    background: '#fff',
    color: '#1c1c21',
    fontFamily: t.font,
    fontSize: px(fs),
    lineHeight: lh,
    width: '100%',
    boxSizing: 'border-box',
    padding: '52px 58px',
    minHeight: 'calc(100% * 11 / 8.5)',
    boxShadow: 'var(--shadow-lg)',
    borderRadius: 2,
  }

  if (type === 'letter') {
    const c = content as LetterContent
    return (
      <div style={{ ...base, ...style }} data-screen-label="Letter paper">
        <div style={{ textAlign: t.centerName ? 'center' : 'left', marginBottom: 22 }}>
          <div style={{ fontFamily: t.headFont, fontWeight: 700, fontSize: px(fs) * 1.7, letterSpacing: '0.01em', color: t.accent }}>{c.name}</div>
          <div style={{ fontSize: px(fs) * 0.86, color: '#52525b', marginTop: 4 }}>{c.contact}</div>
        </div>
        <div style={{ marginBottom: 18, fontSize: px(fs) * 0.95 }}>
          <div>{c.date}</div>
          <div style={{ marginTop: 10 }}>{c.recipient}</div>
          <div>
            {c.company} · {c.role}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>{c.greeting}</div>
        {c.body.map((p, i) => (
          <p key={i} style={{ margin: '0 0 12px' }}>
            {p}
          </p>
        ))}
        <div style={{ marginTop: 22 }}>{c.closing}</div>
        <div style={{ marginTop: 26, fontFamily: t.headFont, fontWeight: 600 }}>{c.name}</div>
      </div>
    )
  }

  const c = content as ResumeContent
  return (
    <div style={{ ...base, ...style }} data-screen-label="Resume paper">
      <div style={{ textAlign: t.centerName ? 'center' : 'left', marginBottom: 18 }}>
        <div style={{ fontFamily: t.headFont, fontWeight: 700, fontSize: px(fs) * 1.9, letterSpacing: '0.01em', color: t.accent }}>{c.name}</div>
        <div style={{ fontWeight: 600, fontSize: px(fs) * 1.05, marginTop: 2 }}>{c.headline}</div>
        <div style={{ fontSize: px(fs) * 0.86, color: '#52525b', marginTop: 4 }}>{c.contact}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <PaperHead t={t} size={px(fs)}>
          Summary
        </PaperHead>
        <p style={{ margin: 0 }}>{c.summary}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <PaperHead t={t} size={px(fs)}>
          Experience
        </PaperHead>
        {c.experience.map((e, i) => (
          <div key={i} style={{ marginBottom: i === c.experience.length - 1 ? 0 : 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700 }}>
              <span>
                {e.role}
                {e.org ? <span style={{ fontWeight: 400 }}> · {e.org}</span> : null}
              </span>
              <span style={{ fontWeight: 400, color: '#52525b', whiteSpace: 'nowrap' }}>{e.when}</span>
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {e.bullets.filter(Boolean).map((b, j) => (
                <li key={j} style={{ marginBottom: 2 }}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <PaperHead t={t} size={px(fs)}>
          Education
        </PaperHead>
        {c.education.map((e, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>
              <strong>{e.degree}</strong>
              {e.org ? <span> · {e.org}</span> : null}
            </span>
            <span style={{ color: '#52525b' }}>{e.when}</span>
          </div>
        ))}
      </div>
      {c.certifications.filter(Boolean).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PaperHead t={t} size={px(fs)}>
            Certifications
          </PaperHead>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {c.certifications.filter(Boolean).map((cert, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {cert}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <PaperHead t={t} size={px(fs)}>
          Skills
        </PaperHead>
        <div>{c.skills.join('  ·  ')}</div>
      </div>
    </div>
  )
}

/** Full-screen preview viewer: shows the TRUE stored document text verbatim
 *  (no parsing/formatting) — parsing into the structured builder happens only
 *  when the user opens it via "Open in Builder". */
export function PreviewModal({
  item,
  type,
  text,
  onClose,
  onEdit,
  onToast,
}: {
  item: DocItem | null
  type: DocType
  text: string
  onClose: () => void
  onEdit: (item: DocItem) => void
  onToast: ToastFn
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch a short-lived signed URL for the ACTUAL uploaded file (for the PDF
  // viewer + Download). Keyed by path so we never synchronously reset state in
  // the effect — a stale URL from a prior item is ignored in render below.
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null)
  const originalPath = item?.originalPath ?? null
  useEffect(() => {
    let active = true
    if (originalPath) {
      getSignedUrl(originalPath)
        .then((url) => {
          if (active) setSigned({ path: originalPath, url })
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [originalPath])

  if (!item) return null

  const signedUrl = signed && signed.path === originalPath ? signed.url : null
  const displayName = item.fileName ?? item.name
  const isPdf = item.mimeType === 'application/pdf' || /\.pdf$/i.test(displayName)
  const isDocx = (item.mimeType ?? '').includes('wordprocessingml') || /\.docx?$/i.test(displayName)
  const download = () => {
    if (signedUrl) window.open(signedUrl, '_blank', 'noopener')
    else onToast(`Preparing ${displayName}…`, 'download', 'var(--bkt-blue-300)')
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(16,16,19,0.55)', backdropFilter: 'blur(4px)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}
      ></div>

      {/* toolbar */}
      <div
        className="bkt-enter"
        style={{
          position: 'relative',
          alignSelf: 'center',
          marginTop: 18,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px 8px 16px',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-pill)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <Icon name={type === 'resume' ? 'file-text' : 'pen-line'} size={16} color="var(--primary)" />
        <span
          style={{
            font: '600 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-strong)',
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </span>
        <BktBadge tone="neutral" appearance="soft">
          {item.note ?? 'Document'}
        </BktBadge>
        <span style={{ width: 1, height: 18, background: 'var(--border)' }}></span>
        {item.originalPath && (
          <BktButton variant="ghost" size="sm" iconLeft={<Icon name="download" size={14} />} onClick={download}>
            Download
          </BktButton>
        )}
        <BktButton variant="primary" size="sm" iconLeft={<Icon name="pencil" size={13} />} onClick={() => onEdit(item)}>
          {type === 'resume' ? 'Open Resume Builder' : 'Open in Builder'}
        </BktButton>
        <BktButton variant="ghost" size="icon" aria-label="Close preview" onClick={onClose}>
          <Icon name="x" size={16} />
        </BktButton>
      </div>

      {/* document stage — the ACTUAL uploaded file: real PDF viewer, else text */}
      <div className="bkt-scroll" style={{ position: 'relative', flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '22px 24px 40px' }}>
        {item.originalPath && isPdf ? (
          signedUrl ? (
            <iframe
              title={displayName}
              src={signedUrl}
              className="bkt-enter"
              style={{ width: 'min(1215px, 95vw)', height: '82vh', flexShrink: 0, border: 'none', borderRadius: 4, boxShadow: 'var(--shadow-lg)', background: '#fff' }}
            />
          ) : (
            <span style={{ alignSelf: 'center', color: '#fff', font: '500 14px/1 var(--font-body)' }}>Loading PDF…</span>
          )
        ) : (
          <div
            className="bkt-enter"
            style={{
              width: 'min(1107px, 95vw)',
              flexShrink: 0,
              alignSelf: 'flex-start',
              background: '#fff',
              color: '#1c1c21',
              borderRadius: 2,
              boxShadow: 'var(--shadow-lg)',
              padding: '52px 58px',
              minHeight: 'calc((min(1107px, 95vw)) * 11 / 8.5)',
              boxSizing: 'border-box',
            }}
          >
            {isDocx && item.originalPath && (
              <div style={{ marginBottom: 16, padding: '9px 13px', background: 'var(--bkt-blue-50)', borderRadius: 8, font: '500 13px/1.4 var(--font-body)', color: 'var(--text-muted)' }}>
                Word documents can't render in the browser — showing the extracted text. Use Download for the original .docx.
              </div>
            )}
            {text.trim() ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5 }}>
                {text}
              </pre>
            ) : (
              <span style={{ color: '#71717a', fontStyle: 'italic' }}>
                This document has no extractable text. {item.originalPath ? 'Use Download for the original file.' : 'Open it in the builder to add content.'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
