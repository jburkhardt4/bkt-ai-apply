// BKT AI-Apply — DocBuilder: resume / cover-letter builder.
// Ported 1:1 from the design-system UI kit (DocBuilder.jsx).
// Left: format + section editors · Center: live paper · Right/floating: AI Writer.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktInput } from '@/components/bkt/BktInput'
import type { ToastFn } from '@/components/bkt/toast'
import type { DocItem, DocsData, LetterContent, ResumeContent, ResumeExperience } from '../types'
import { DocPaper } from './DocPaper'
import type { DocContent, DocType } from './DocPaper'
import { DocAssistant } from './DocAssistant'
import type { AiTargetJob } from './DocAssistant'
import { alignDocumentToJob } from '../services/docWriterService'
import { parseGeneratedLetter, parseGeneratedResume } from '../services/docContentParser'

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

/** Row header for a repeatable section item: an uppercase label + Remove. */
function DBItemHeader({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 }}>
      <span style={{ font: '600 var(--text-xs)/1 var(--font-body)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {onRemove && (
        <BktButton variant="ghost" size="sm" iconLeft={<Icon name="trash-2" size={13} color="var(--bkt-danger)" />} onClick={onRemove}>
          Remove
        </BktButton>
      )}
    </div>
  )
}

/** Full-width dashed "add another item" button for a repeatable section. */
function DBAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <BktButton variant="outline" size="sm" iconLeft={<Icon name="plus" size={14} color="var(--primary)" />} onClick={onClick} style={{ alignSelf: 'flex-start' }}>
      {label}
    </BktButton>
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
  /** Authenticated user id — enables real LLM generation; null = demo preview. */
  userId: string | null
  lastJob: AiTargetJob
  aiVariant: 'rail' | 'floating'
  onBack: () => void
  onToast: ToastFn
}

export function DocBuilder({ type, docs, item, initialContent, autoAlign = false, userId, lastJob, aiVariant, onBack, onToast }: DocBuilderProps) {
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

  // --- structured-section mutators (resume) ---
  // Each section is fully editable: roles, education entries, and bullet lines
  // can be added or removed. Bullets keep blank lines while editing (so Enter
  // starts a new bullet); DocPaper filters empties at render.
  const setExperience = (next: ResumeExperience[]) => set({ experience: next })
  const addRole = () => setExperience([...rc.experience, { role: '', org: '', when: '', bullets: [''] }])
  const removeRole = (idx: number) => setExperience(rc.experience.filter((_, j) => j !== idx))
  const patchRole = (idx: number, patch: Partial<ResumeExperience>) =>
    setExperience(rc.experience.map((e, j) => (j === idx ? { ...e, ...patch } : e)))

  const setEducation = (next: ResumeContent['education']) => set({ education: next })
  const addEducation = () => setEducation([...rc.education, { degree: '', org: '', when: '' }])
  const removeEducation = (idx: number) => setEducation(rc.education.filter((_, j) => j !== idx))
  const patchEducation = (idx: number, patch: Partial<ResumeContent['education'][number]>) =>
    setEducation(rc.education.map((e, j) => (j === idx ? { ...e, ...patch } : e)))

  // --- letter body paragraph mutators ---
  const setBody = (next: string[]) => set({ body: next })
  const addParagraph = () => setBody([...lc.body, ''])
  const removeParagraph = (idx: number) => setBody(lc.body.filter((_, j) => j !== idx))

  // Maps the FULL generated document into the structured builder state (not a
  // single field) so the paper reflects the whole document. The canonical
  // full-text artifact is persisted separately to the `documents` table.
  const applyAligned = (text: string) => {
    if (type === 'resume') {
      const base = content as ResumeContent
      set(
        parseGeneratedResume(text, {
          headline: lastJob.title,
          jobSkills: lastJob.skills ?? [],
          baseSkills: base.skills,
          baseExperience: base.experience,
        }),
      )
    } else {
      set(parseGeneratedLetter(text, { company: lastJob.company, role: lastJob.title }))
    }
    setAligned(true)
    setTimeout(() => setAligned(false), 1800)
  }

  // Demo-mode (no auth) pre-baked copy so the design-review UAT stays
  // interactive without Supabase / Edge Functions.
  const demoAlignedText = (): string =>
    type === 'resume'
      ? `Salesforce consulting leader targeting the ${lastJob.title} role at ${lastJob.company}. 12+ years leading engagements end-to-end: solution design, integration management, and client delivery teams of 30+ consultants, with CPQ architecture wins (38% faster quotes) and multi-cloud programs to $4.5M.`
      : `I am writing to apply for the ${lastJob.title} role at ${lastJob.company}. Over the last twelve years I have led Salesforce delivery from both sides of the table, most recently as founder of BKT Advisory, where I run discovery-to-go-live engagements for enterprise clients.`

  const runAlign = async () => {
    if (aligning) return
    setAligning(true)

    // Demo preview path — keep the prior pre-baked behavior.
    if (!userId) {
      setTimeout(() => {
        applyAligned(demoAlignedText())
        setAligning(false)
        onToast(`Aligned to ${lastJob.company} · ${lastJob.title}`, 'wand-sparkles', 'var(--bkt-blue-300)')
      }, 1100)
      return
    }

    // Live path — real generation via the routed generate-document Edge Function.
    try {
      const result = await alignDocumentToJob({ userId, type, lastJob, content })
      if (result.status === 'queued') {
        onToast(`AI budget reached: ${result.reason}`, 'circle-alert', 'var(--bkt-warning)')
        return
      }
      applyAligned(result.content)
      onToast(
        result.source === 'llm'
          ? `Aligned to ${lastJob.company} · ${lastJob.title}`
          : `Aligned (offline draft) · ${lastJob.company}`,
        'wand-sparkles',
        'var(--bkt-blue-300)',
      )
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Auto-align failed', 'circle-x', 'var(--bkt-danger)')
    } finally {
      setAligning(false)
    }
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
                    <DBItemHeader label={`Role ${i + 1}`} onRemove={() => removeRole(i)} />
                    <BktInput label="Title" value={e.role} onChange={(ev) => patchRole(i, { role: ev.target.value })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                      <BktInput label="Organization" value={e.org} onChange={(ev) => patchRole(i, { org: ev.target.value })} />
                      <BktInput label="When" value={e.when} onChange={(ev) => patchRole(i, { when: ev.target.value })} />
                    </div>
                    <DBArea
                      label="Bullets (one per line)"
                      rows={3}
                      value={e.bullets.join('\n')}
                      onChange={(v) => patchRole(i, { bullets: v.split('\n') })}
                    />
                  </div>
                ))}
                <DBAddButton label="Add role" onClick={addRole} />
              </DBGroup>
              <DBGroup icon="graduation-cap" label="Education">
                {rc.education.map((e, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: i < rc.education.length - 1 ? '1px dashed var(--border)' : 'none' }}
                  >
                    <DBItemHeader label={`Entry ${i + 1}`} onRemove={() => removeEducation(i)} />
                    <BktInput label="Degree" value={e.degree} onChange={(ev) => patchEducation(i, { degree: ev.target.value })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                      <BktInput label="Institution" value={e.org} onChange={(ev) => patchEducation(i, { org: ev.target.value })} />
                      <BktInput label="Year" value={e.when} onChange={(ev) => patchEducation(i, { when: ev.target.value })} />
                    </div>
                  </div>
                ))}
                <DBAddButton label="Add education" onClick={addEducation} />
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
              <DBGroup icon="award" label="Certifications">
                <DBArea
                  label="One per line"
                  rows={3}
                  value={rc.certifications.join('\n')}
                  onChange={(v) =>
                    set({
                      certifications: v
                        .split('\n')
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
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <DBItemHeader
                      label={`Paragraph ${i + 1}`}
                      onRemove={lc.body.length > 1 ? () => removeParagraph(i) : undefined}
                    />
                    <DBArea
                      rows={4}
                      value={p}
                      onChange={(v) => {
                        const xs = lc.body.slice()
                        xs[i] = v
                        setBody(xs)
                      }}
                    />
                  </div>
                ))}
                <DBAddButton label="Add paragraph" onClick={addParagraph} />
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
          userId={userId}
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
