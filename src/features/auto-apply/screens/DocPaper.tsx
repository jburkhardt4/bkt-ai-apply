// BKT AI-Apply — DocPaper: renders a resume / cover letter as a real
// paper page (template-aware), plus the full-screen PreviewModal viewer.
// Ported 1:1 from the design-system UI kit (DocPaper.jsx).
import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, LetterContent, PaperTemplate, ResumeContent } from '../types'

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
      <div>
        <PaperHead t={t} size={px(fs)}>
          Skills
        </PaperHead>
        <div>{c.skills.join('  ·  ')}</div>
      </div>
    </div>
  )
}

/** Full-screen preview viewer: dimmed stage, floating toolbar, scrollable paper. */
export function PreviewModal({
  item,
  type,
  content,
  template,
  onClose,
  onEdit,
  onToast,
}: {
  item: DocItem | null
  type: DocType
  content: DocContent | null
  template: PaperTemplate | null
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
  if (!item || !content || !template) return null
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
          {template.name} · {template.sub}
        </BktBadge>
        <span style={{ width: 1, height: 18, background: 'var(--border)' }}></span>
        <BktButton variant="ghost" size="sm" iconLeft={<Icon name="download" size={14} />} onClick={() => onToast(`Downloading ${item.name}`, 'download', 'var(--bkt-blue-300)')}>
          Download
        </BktButton>
        <BktButton variant="primary" size="sm" iconLeft={<Icon name="pencil" size={13} />} onClick={() => onEdit(item)}>
          Open in Builder
        </BktButton>
        <BktButton variant="ghost" size="icon" aria-label="Close preview" onClick={onClose}>
          <Icon name="x" size={16} />
        </BktButton>
      </div>

      {/* paper stage */}
      <div className="bkt-scroll" style={{ position: 'relative', flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '22px 24px 40px' }}>
        <div className="bkt-enter" style={{ width: 'min(820px, 94vw)', flexShrink: 0, alignSelf: 'flex-start' }}>
          <DocPaper type={type} content={content} template={template} />
        </div>
      </div>
    </div>
  )
}
