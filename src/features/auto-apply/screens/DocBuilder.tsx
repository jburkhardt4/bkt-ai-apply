// BKT AI-Apply — DocBuilder: resume / cover-letter builder.
// Ported 1:1 from the design-system UI kit (DocBuilder.jsx).
// Left: format + section editors · Center: live paper · Right/floating: AI Writer.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktInput } from '@/components/bkt/BktInput'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, DocsData, LetterContent, ResumeContent } from '../types'
import { DocPaper } from './DocPaper'
import type { DocContent, DocType } from './DocPaper'
import { DocAssistant } from './DocAssistant'
import type { AiTargetJob } from './DocAssistant'

type Patch = Partial<ResumeContent> & Partial<LetterContent>

function DBArea({ label, value, onChange, rows = 4 }: { label?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <span style={{ font: '600 var(--text-xs)/1 var(--font-body)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {label}
        </span>
      )}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="bkt-scroll"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: '9px 11px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          font: '400 var(--text-sm)/1.5 var(--font-body)',
          color: 'var(--text-strong)',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--primary)'
          e.target.style.boxShadow = 'var(--shadow-focus)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border)'
          e.target.style.boxShadow = 'none'
        }}
      />
    </label>
  )
}

function DBGroup({ icon, label, children, defaultOpen = false }: { icon: string; label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '12px 4px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          font: '600 var(--text-sm)/1 var(--font-body)',
          color: 'var(--text-strong)',
        }}
      >
        <Icon name={icon} size={15} color="var(--primary)" />
        <span style={{ flex: 1 }}>{label}</span>
        <Icon
          name="chevron-down"
          size={14}
          color="var(--bkt-zinc-400)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
        />
      </button>
      {open && (
        <div className="bkt-enter" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '2px 4px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function TemplateCard({ t, active, onClick }: { t: DocsData['templates'][number]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bkt-press"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 12px',
        textAlign: 'left',
        background: active ? 'var(--bkt-blue-50)' : 'var(--surface)',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        transition: 'border-color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
      }}
    >
      <span style={{ fontFamily: t.headFont, fontWeight: 700, fontSize: 15, color: active ? 'var(--bkt-blue-700)' : 'var(--text-strong)' }}>{t.name}</span>
      <span style={{ fontFamily: t.font, fontSize: 11.5, color: 'var(--text-muted)' }}>{t.sub} · Aa Bb 123</span>
    </button>
  )
}

function FmtSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: '600 var(--text-xs)/1 var(--font-body)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        {label}
        <span className="bkt-num" style={{ textTransform: 'none', color: 'var(--text-strong)' }}>
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--primary)' }} />
    </label>
  )
}

export interface DocBuilderProps {
  type: DocType
  docs: DocsData
  item: DocItem | null
  initialContent: DocContent
  autoAlign?: boolean
  lastJob: AiTargetJob
  aiVariant: 'rail' | 'floating'
  onBack: () => void
  onToast: ToastFn
}

export function DocBuilder({ type, docs, item, initialContent, autoAlign = false, lastJob, aiVariant, onBack, onToast }: DocBuilderProps) {
  const [content, setContent] = useState<DocContent>(initialContent)
  const [tplId, setTplId] = useState(item?.template ?? 'classic')
  const [fmt, setFmt] = useState({ fontSize: 11, lineHeight: 1.45 })
  const [saving, setSaving] = useState(false)
  const [aligning, setAligning] = useState(false)
  const [aligned, setAligned] = useState(false)
  const tpl = docs.templates.find((t) => t.id === tplId) ?? docs.templates[0]!
  const saveT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const rc = content as ResumeContent
  const lc = content as LetterContent

  const set = (patch: Patch) => {
    setContent((c) => ({ ...c, ...patch }) as DocContent)
    setSaving(true)
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => setSaving(false), 900)
  }

  const runAlign = () => {
    if (aligning) return
    setAligning(true)
    setTimeout(() => {
      if (type === 'resume') {
        const base = initialContent as ResumeContent
        set({
          headline: lastJob.title,
          summary: `Salesforce consulting leader targeting the ${lastJob.title} role at ${lastJob.company}. 12+ years leading engagements end-to-end — solution design, integration management, and client delivery teams of 30+ consultants — with CPQ architecture wins (38% faster quotes) and multi-cloud programs to $4.5M.`,
          skills: [...new Set([...(lastJob.skills ?? []), ...base.skills])].slice(0, 10),
        })
      } else {
        const base = initialContent as LetterContent
        set({
          company: lastJob.company,
          role: lastJob.title,
          recipient: `${lastJob.company} Hiring Team`,
          greeting: `Dear ${lastJob.company} Hiring Team,`,
          body: [
            `I am writing to apply for the ${lastJob.title} role at ${lastJob.company}. Over the last twelve years I have led Salesforce delivery from both sides of the table — most recently as founder of BKT Advisory, where I run discovery-to-go-live engagements for enterprise clients.`,
            ...base.body.slice(1),
          ],
        })
      }
      setAligning(false)
      setAligned(true)
      setTimeout(() => setAligned(false), 1800)
      onToast(`Aligned to ${lastJob.company} — ${lastJob.title}`, 'wand-sparkles', 'var(--bkt-blue-300)')
    }, 1100)
  }

  // Kick off auto-align on mount from a timer callback so no state is set
  // synchronously inside the effect body.
  useEffect(() => {
    if (!autoAlign) return
    const t = setTimeout(runAlign, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = item ? item.name : type === 'resume' ? 'Untitled Resume' : 'Untitled Cover Letter'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderBottom: '1px solid var(--border)' }}>
        <BktButton variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" size={15} />} onClick={onBack}>
          {type === 'resume' ? 'Resumes' : 'Cover Letters'}
        </BktButton>
        <span style={{ width: 1, height: 20, background: 'var(--border)' }}></span>
        <span
          style={{
            font: '600 var(--text-md)/1.2 var(--font-display)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--text-strong)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 var(--text-xs)/1 var(--font-body)', color: saving ? 'var(--bkt-warning)' : 'var(--bkt-success)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }}></span>
          {saving ? 'Saving…' : 'Saved'}
        </span>
        <div style={{ flex: 1 }}></div>
        <BktButton variant="outline" size="md" loading={aligning} iconLeft={!aligning ? <Icon name="wand-sparkles" size={15} color="var(--primary)" /> : null} onClick={runAlign}>
          {aligning ? 'Aligning…' : `Auto-Align: ${lastJob.company}`}
        </BktButton>
        <BktButton variant="primary" size="md" iconLeft={<Icon name="download" size={15} />} onClick={() => onToast('Exporting PDF…', 'download', 'var(--bkt-blue-300)')}>
          Download PDF
        </BktButton>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* editor column */}
        <div className="bkt-scroll" style={{ width: 360, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '8px 20px 24px' }}>
          <DBGroup icon="palette" label="Format" defaultOpen>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {docs.templates.map((t) => (
                <TemplateCard key={t.id} t={t} active={t.id === tplId} onClick={() => setTplId(t.id)} />
              ))}
            </div>
            <FmtSlider label="Font size" value={fmt.fontSize} min={9.5} max={13} step={0.5} unit="pt" onChange={(v) => setFmt((f) => ({ ...f, fontSize: v }))} />
            <FmtSlider label="Line spacing" value={fmt.lineHeight} min={1.2} max={1.8} step={0.05} unit="" onChange={(v) => setFmt((f) => ({ ...f, lineHeight: v }))} />
          </DBGroup>

          <DBGroup icon="user" label="Identity" defaultOpen={type === 'letter'}>
            <BktInput label="Name" value={content.name} onChange={(e) => set({ name: e.target.value })} />
            {type === 'resume' && <BktInput label="Headline" value={rc.headline} onChange={(e) => set({ headline: e.target.value })} />}
            <BktInput label="Contact line" value={content.contact} onChange={(e) => set({ contact: e.target.value })} />
          </DBGroup>

          {type === 'resume' ? (
            <>
              <DBGroup icon="align-left" label="Summary" defaultOpen>
                <DBArea value={rc.summary} rows={5} onChange={(v) => set({ summary: v })} />
              </DBGroup>
              <DBGroup icon="briefcase-business" label="Experience">
                {rc.experience.map((e, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: i < rc.experience.length - 1 ? '1px dashed var(--border)' : 'none' }}
                  >
                    <BktInput
                      label={`Role ${i + 1}`}
                      value={e.role}
                      onChange={(ev) => {
                        const xs = rc.experience.slice()
                        xs[i] = { ...e, role: ev.target.value }
                        set({ experience: xs })
                      }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                      <BktInput
                        label="Organization"
                        value={e.org}
                        onChange={(ev) => {
                          const xs = rc.experience.slice()
                          xs[i] = { ...e, org: ev.target.value }
                          set({ experience: xs })
                        }}
                      />
                      <BktInput
                        label="When"
                        value={e.when}
                        onChange={(ev) => {
                          const xs = rc.experience.slice()
                          xs[i] = { ...e, when: ev.target.value }
                          set({ experience: xs })
                        }}
                      />
                    </div>
                    <DBArea
                      label="Bullets (one per line)"
                      rows={3}
                      value={e.bullets.join('\n')}
                      onChange={(v) => {
                        const xs = rc.experience.slice()
                        xs[i] = { ...e, bullets: v.split('\n').filter(Boolean) }
                        set({ experience: xs })
                      }}
                    />
                  </div>
                ))}
              </DBGroup>
              <DBGroup icon="graduation-cap" label="Education">
                {rc.education.map((e, i) => (
                  <BktInput
                    key={i}
                    label="Degree"
                    value={`${e.degree} — ${e.org} (${e.when})`}
                    onChange={(ev) => {
                      const m = ev.target.value
                      const xs = rc.education.slice()
                      xs[i] = { ...e, degree: m.split(' — ')[0] || m }
                      set({ education: xs })
                    }}
                  />
                ))}
              </DBGroup>
              <DBGroup icon="list-checks" label="Skills">
                <DBArea
                  label="Comma separated"
                  rows={3}
                  value={rc.skills.join(', ')}
                  onChange={(v) =>
                    set({
                      skills: v
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </DBGroup>
            </>
          ) : (
            <>
              <DBGroup icon="building-2" label="Recipient" defaultOpen>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <BktInput label="Company" value={lc.company} onChange={(e) => set({ company: e.target.value })} />
                  <BktInput label="Role" value={lc.role} onChange={(e) => set({ role: e.target.value })} />
                </div>
                <BktInput label="Addressed to" value={lc.recipient} onChange={(e) => set({ recipient: e.target.value, greeting: `Dear ${e.target.value},` })} />
              </DBGroup>
              <DBGroup icon="align-left" label="Letter body" defaultOpen>
                {lc.body.map((p, i) => (
                  <DBArea
                    key={i}
                    label={`Paragraph ${i + 1}`}
                    rows={4}
                    value={p}
                    onChange={(v) => {
                      const xs = lc.body.slice()
                      xs[i] = v
                      set({ body: xs })
                    }}
                  />
                ))}
                <BktInput label="Closing" value={lc.closing} onChange={(e) => set({ closing: e.target.value })} />
              </DBGroup>
            </>
          )}
        </div>

        {/* paper preview */}
        <div
          className="bkt-scroll"
          style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bkt-slate-100)', display: 'flex', justifyContent: 'center', padding: '26px 28px 44px' }}
        >
          <div
            style={{
              width: 'min(780px, 100%)',
              alignSelf: 'flex-start',
              position: 'relative',
              outline: aligned ? '2px solid var(--primary)' : '2px solid transparent',
              outlineOffset: 4,
              borderRadius: 4,
              transition: 'outline-color 0.5s var(--ease-standard)',
              filter: aligning ? 'blur(2px) saturate(0.9)' : 'none',
            }}
          >
            <DocPaper type={type} content={content} template={tpl} fmt={fmt} />
            {aligning && (
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span
                  className="bkt-enter"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '10px 18px',
                    background: 'var(--bkt-zinc-900)',
                    color: '#fff',
                    borderRadius: 'var(--radius-pill)',
                    font: '600 var(--text-sm)/1 var(--font-body)',
                    boxShadow: 'var(--shadow-xl)',
                  }}
                >
                  <Icon name="wand-sparkles" size={15} />
                  Aligning to {lastJob.company}…
                </span>
              </span>
            )}
          </div>
        </div>

        {/* AI Writer */}
        <DocAssistant
          type={type}
          variant={aiVariant}
          ai={docs.ai}
          lastJob={lastJob}
          onPatch={(target, text) => {
            if (target === 'summary') set({ summary: text })
            else if (target === 'body0') set({ body: [text, ...lc.body.slice(1)] })
            onToast('Suggestion applied', 'circle-check', 'var(--bkt-success)')
          }}
        />
      </div>
    </div>
  )
}
