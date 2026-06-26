// BKT AI-Apply — DocBuilder: resume / cover-letter builder.
// Ported 1:1 from the design-system UI kit (DocBuilder.jsx).
// Left: format + section editors · Center: live paper · Right/floating: AI Writer.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktInput } from '@/components/bkt/BktInput'
import type { ToastFn } from '@/components/bkt/toast'
import type {
  BuilderConfig,
  CustomSection,
  CustomSectionFormat,
  DocItem,
  DocsData,
  LetterContent,
  ResumeContent,
  ResumeExperience,
  SectionBulletKey,
} from '../types'
import { DocPaper } from './DocPaper'
import type { DocContent, DocType } from './DocPaper'
import { DocAssistant } from './DocAssistant'
import type { AiTargetJob } from './DocAssistant'
import { alignDocumentToJob } from '../services/docWriterService'
import { parseGeneratedLetter, parseGeneratedResume, serializeLetter, serializeResume } from '../services/docContentParser'
import { builderConfigToJson, effectiveSectionOrder, MAX_CUSTOM_SECTIONS, parseBuilderConfig } from '../services/builderConfig'
import { createDocumentVersion, updateDocumentContent } from '../../applications/services/documentStorageService'

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
function DBAddButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <BktButton variant="outline" size="sm" disabled={disabled} iconLeft={<Icon name="plus" size={14} color="var(--primary)" />} onClick={onClick} style={{ alignSelf: 'flex-start' }}>
      {label}
    </BktButton>
  )
}

/** A labeled on/off switch for a formatting option. */
function DBToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="bkt-press"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '7px 2px', background: 'none', border: 'none', cursor: 'pointer', font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}
    >
      <span>{label}</span>
      <span style={{ position: 'relative', width: 34, height: 20, flexShrink: 0, borderRadius: 'var(--radius-pill)', background: checked ? 'var(--primary)' : 'var(--bkt-zinc-300)', transition: 'background var(--dur-fast) var(--ease-standard)' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-fast) var(--ease-standard)' }} />
      </span>
    </button>
  )
}

/** Segmented format selector for a custom section (bullets / table / text). */
function DBFormatPicker({ value, onChange }: { value: CustomSectionFormat; onChange: (f: CustomSectionFormat) => void }) {
  const opts: { id: CustomSectionFormat; label: string }[] = [
    { id: 'bullets', label: 'Bullets' },
    { id: 'table', label: 'Table' },
    { id: 'text', label: 'Text' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bkt-zinc-100)', borderRadius: 'var(--radius-md)' }}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="bkt-press"
          style={{ flex: 1, padding: '5px 0', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', font: '600 var(--text-xs)/1 var(--font-body)', background: value === o.id ? 'var(--surface)' : 'transparent', color: value === o.id ? 'var(--primary)' : 'var(--text-muted)', boxShadow: value === o.id ? 'var(--shadow-sm)' : 'none' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DBGroup({ icon, label, children, defaultOpen = false, grip }: { icon: string; label: string; children: ReactNode; defaultOpen?: boolean; grip?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {grip}
        <button
          onClick={() => setOpen((o) => !o)}
          className="bkt-press"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flex: 1,
            minWidth: 0,
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
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <Icon
            name="chevron-down"
            size={14}
            color="var(--bkt-zinc-400)"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
          />
        </button>
      </div>
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
  /** Called after a successful durable save so the home list can refresh. */
  onSaved?: () => void
}

/** Serializes the builder content to the round-trippable text we persist. */
function serializeDoc(type: DocType, content: DocContent): string {
  return type === 'resume' ? serializeResume(content as ResumeContent) : serializeLetter(content as LetterContent)
}

export function DocBuilder({ type, docs, item, initialContent, autoAlign = false, userId, lastJob, aiVariant, onBack, onToast, onSaved }: DocBuilderProps) {
  const [content, setContent] = useState<DocContent>(initialContent)
  const [tplId, setTplId] = useState(item?.template ?? 'classic')
  const [fmt, setFmt] = useState({ fontSize: 11, lineHeight: 1.45 })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [aligning, setAligning] = useState(false)
  const [aligned, setAligned] = useState(false)
  // Per-resume formatting config (bullet toggles + custom sections), Phase 2.
  const [config, setConfig] = useState<BuilderConfig>(() => parseBuilderConfig(item?.builderConfig ?? null))
  const tpl = docs.templates.find((t) => t.id === tplId) ?? docs.templates[0]!

  // Durable autosave state: the backing documents row (if the doc is already
  // persisted), the last saved signature (text + config, to skip no-op saves),
  // and a mount guard.
  const docRef = useRef<{ documentId: string; storagePath: string } | null>(
    item?.documentId && item?.storagePath
      ? { documentId: item.documentId, storagePath: item.storagePath }
      : null,
  )
  const sigOf = (text: string, cfg: BuilderConfig) => `${text} ${JSON.stringify(builderConfigToJson(cfg))}`
  const lastSavedSig = useRef(sigOf(serializeDoc(type, initialContent), config))
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const rc = content as ResumeContent
  const lc = content as LetterContent

  const set = (patch: Patch) => {
    setContent((c) => ({ ...c, ...patch }) as DocContent)
    setDirty(true)
  }

  // Persists the current text + formatting config durably: in-place update when
  // the doc already exists, else a first createDocumentVersion. Drives the real
  // Saving/Saved state and surfaces errors. Skipped in demo (no userId).
  const persist = async (text: string, cfg: BuilderConfig): Promise<void> => {
    const sig = sigOf(text, cfg)
    if (!userId || sig === lastSavedSig.current) return
    const builderConfig = builderConfigToJson(cfg)
    setSaving(true)
    try {
      if (docRef.current) {
        await updateDocumentContent({ userId, ...docRef.current, content: text, builderConfig })
      } else {
        const stored = await createDocumentVersion({
          userId,
          documentType: type === 'resume' ? 'resume' : 'cover_letter',
          content: text,
          builderConfig,
        })
        docRef.current = { documentId: stored.documentId, storagePath: stored.storagePath }
      }
      lastSavedSig.current = sig
      if (mounted.current) setDirty(false)
      onSaved?.()
    } catch (e: unknown) {
      if (mounted.current) onToast(e instanceof Error ? e.message : 'Save failed', 'circle-x', 'var(--bkt-danger)')
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  // Debounced durable autosave: 1.2 s after the last edit (content OR config).
  useEffect(() => {
    if (!userId) return
    const text = serializeDoc(type, content)
    if (sigOf(text, config) === lastSavedSig.current) return
    const t = setTimeout(() => void persist(text, config), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, config, userId])

  // Flush any pending edit before leaving so the last change is not lost.
  const handleBack = () => {
    if (userId && dirty) void persist(serializeDoc(type, content), config)
    onBack()
  }

  // --- formatting config mutators (Phase 2) ---
  const updateConfig = (next: BuilderConfig) => {
    setConfig(next)
    setDirty(true)
  }
  const toggleBullets = (key: SectionBulletKey) =>
    updateConfig({ ...config, sectionBullets: { ...config.sectionBullets, [key]: !config.sectionBullets[key] } })
  const addCustomSection = () => {
    if (config.customSections.length >= MAX_CUSTOM_SECTIONS) return
    updateConfig({
      ...config,
      customSections: [
        ...config.customSections,
        { id: `cs-${Date.now().toString(36)}`, title: '', format: 'bullets', body: '' },
      ],
    })
  }
  const removeCustomSection = (id: string) =>
    updateConfig({ ...config, customSections: config.customSections.filter((s) => s.id !== id) })
  const patchCustomSection = (id: string, patch: Partial<CustomSection>) =>
    updateConfig({ ...config, customSections: config.customSections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

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

  // --- section drag-and-drop reordering (Phase 2) ---
  // The content sections (Experience/Education/Skills/Certifications + custom)
  // render in config.sectionOrder; the grip handle drags a section, dropping it
  // onto another reorders. Summary is rendered separately and stays locked first.
  const [dragKey, setDragKey] = useState<string | null>(null)
  const sectionOrder = effectiveSectionOrder(config)
  const moveSection = (from: string, to: string) => {
    if (from === to) return
    const next = [...sectionOrder]
    const fi = next.indexOf(from)
    const ti = next.indexOf(to)
    if (fi < 0 || ti < 0) return
    next.splice(fi, 1)
    next.splice(ti, 0, from)
    updateConfig({ ...config, sectionOrder: next })
  }
  const sectionGrip = (key: string) => (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        setDragKey(key)
      }}
      onDragEnd={() => setDragKey(null)}
      title="Drag to reorder"
      aria-label="Drag to reorder"
      style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', padding: '0 1px 0 6px', color: 'var(--bkt-zinc-400)' }}
    >
      <Icon name="grip-vertical" size={15} />
    </span>
  )
  const sectionWrap = (key: string, group: ReactNode) => (
    <div
      key={key}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (dragKey) moveSection(dragKey, key)
        setDragKey(null)
      }}
      style={{ background: dragKey === key ? 'var(--bkt-blue-50)' : 'transparent', transition: 'background var(--dur-fast) var(--ease-standard)' }}
    >
      {group}
    </div>
  )
  const renderSectionEditor = (key: string): ReactNode => {
    const grip = sectionGrip(key)
    if (key === 'experience') {
      return sectionWrap(
        key,
        <DBGroup icon="briefcase-business" label="Experience" grip={grip}>
          {rc.experience.map((e, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: i < rc.experience.length - 1 ? '1px dashed var(--border)' : 'none' }}>
              <DBItemHeader label={`Role ${i + 1}`} onRemove={() => removeRole(i)} />
              <BktInput label="Title" value={e.role} onChange={(ev) => patchRole(i, { role: ev.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                <BktInput label="Organization" value={e.org} onChange={(ev) => patchRole(i, { org: ev.target.value })} />
                <BktInput label="When" value={e.when} onChange={(ev) => patchRole(i, { when: ev.target.value })} />
              </div>
              <DBArea label="Bullets (one per line)" rows={3} value={e.bullets.join('\n')} onChange={(v) => patchRole(i, { bullets: v.split('\n') })} />
            </div>
          ))}
          <DBAddButton label="Add role" onClick={addRole} />
        </DBGroup>,
      )
    }
    if (key === 'education') {
      return sectionWrap(
        key,
        <DBGroup icon="graduation-cap" label="Education" grip={grip}>
          {rc.education.map((e, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: i < rc.education.length - 1 ? '1px dashed var(--border)' : 'none' }}>
              <DBItemHeader label={`Entry ${i + 1}`} onRemove={() => removeEducation(i)} />
              <BktInput label="Degree" value={e.degree} onChange={(ev) => patchEducation(i, { degree: ev.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
                <BktInput label="Institution" value={e.org} onChange={(ev) => patchEducation(i, { org: ev.target.value })} />
                <BktInput label="Year" value={e.when} onChange={(ev) => patchEducation(i, { when: ev.target.value })} />
              </div>
            </div>
          ))}
          <DBAddButton label="Add education" onClick={addEducation} />
        </DBGroup>,
      )
    }
    if (key === 'skills') {
      return sectionWrap(
        key,
        <DBGroup icon="list-checks" label="Skills" grip={grip}>
          <DBArea label="One per line" rows={4} value={rc.skills.join('\n')} onChange={(v) => set({ skills: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </DBGroup>,
      )
    }
    if (key === 'certifications') {
      return sectionWrap(
        key,
        <DBGroup icon="award" label="Certifications" grip={grip}>
          <DBArea label="One per line" rows={3} value={rc.certifications.join('\n')} onChange={(v) => set({ certifications: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </DBGroup>,
      )
    }
    const s = config.customSections.find((x) => x.id === key)
    if (!s) return null
    const idx = config.customSections.indexOf(s)
    return sectionWrap(
      key,
      <DBGroup icon="layout-list" label={s.title.trim() || `Custom section ${idx + 1}`} grip={grip}>
        <DBItemHeader label={`Custom section ${idx + 1}`} onRemove={() => removeCustomSection(s.id)} />
        <BktInput label="Title" value={s.title} onChange={(ev) => patchCustomSection(s.id, { title: ev.target.value })} />
        <DBFormatPicker value={s.format} onChange={(f) => patchCustomSection(s.id, { format: f })} />
        <DBArea
          label={s.format === 'table' ? 'One row per line · cells separated by |' : s.format === 'text' ? 'Paragraph text' : 'One item per line'}
          rows={s.format === 'text' ? 4 : 3}
          value={s.body}
          onChange={(v) => patchCustomSection(s.id, { body: v })}
        />
      </DBGroup>,
    )
  }

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
        <BktButton variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" size={15} />} onClick={handleBack}>
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 var(--text-xs)/1 var(--font-body)', color: !userId ? 'var(--bkt-zinc-400)' : saving || dirty ? 'var(--bkt-warning)' : 'var(--bkt-success)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }}></span>
          {!userId ? 'Preview' : saving || dirty ? 'Saving…' : 'Saved'}
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
              {/* Reorderable content sections (Summary stays locked above). */}
              {sectionOrder.map(renderSectionEditor)}
              <DBGroup icon="sliders-horizontal" label="Section formatting">
                <span style={{ font: '400 var(--text-xs)/1.4 var(--font-body)', color: 'var(--text-muted)' }}>
                  Show each section as bullet points or inline text.
                </span>
                <DBToggle label="Experience bullets" checked={config.sectionBullets.experience} onChange={() => toggleBullets('experience')} />
                <DBToggle label="Skills bullets" checked={config.sectionBullets.skills} onChange={() => toggleBullets('skills')} />
                <DBToggle label="Education bullets" checked={config.sectionBullets.education} onChange={() => toggleBullets('education')} />
                <DBToggle label="Certifications bullets" checked={config.sectionBullets.certifications} onChange={() => toggleBullets('certifications')} />
              </DBGroup>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 4px', borderBottom: '1px solid var(--border)' }}>
                <Icon name="layout-list" size={15} color="var(--primary)" />
                <span style={{ flex: 1, font: '600 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}>
                  Custom sections {config.customSections.length}/{MAX_CUSTOM_SECTIONS}
                </span>
                <DBAddButton label="Add" onClick={addCustomSection} disabled={config.customSections.length >= MAX_CUSTOM_SECTIONS} />
              </div>
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
            <DocPaper type={type} content={content} template={tpl} fmt={fmt} config={config} />
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
