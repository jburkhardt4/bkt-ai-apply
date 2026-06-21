// BKT AI-Apply — Preferences screen.
// Ported 1:1 from the design-system UI kit (PreferencesScreen.jsx).
// Sections: Role & Experience · Location · Compensation · Filtering ·
//           Eligibility · Personal Info · Application Behaviour
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import type { ToastFn } from '@/components/bkt/toast'
import { useAuth } from '@/contexts/auth-context'
import {
  deleteApplicationAnswer,
  fetchApplicationAnswers,
  fetchCandidateProfile,
  upsertApplicationAnswer,
  upsertCandidateProfile,
} from '@/features/applications/services/candidateProfileWriteService'
import { brandAsset } from '../assets'
import { REVIEW_MODES } from '../reviewModes'
import { useReviewMode } from '../state'
import type { ReviewModeId } from '../types'
import {
  EEO_QUESTIONS,
  PROFILE_FORM_DEFAULT,
  formToProfilePatch,
  parseEeoDisclosures,
  profileRowToForm,
  slugifyQuestionKey,
  type EeoDisclosures,
  type ProfileForm,
} from './preferencesProfile'

/* ─────────────── COMPENSATION CONVERSION HELPERS ─────────────── */
// Standard US work year used for hourly⇄salary conversion.
const HOURS_PER_YEAR = 2080

/** Strips `$`, commas, and stray characters; returns a finite number or null. */
function parseCurrency(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Formats a whole-dollar salary with thousands separators: 150000 → "150,000". */
function formatSalary(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** Formats an hourly rate with thousands separators and 2 decimals: 72.115 → "72.12". */
function formatHourly(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ─────────────────────── FORM PRIMITIVES ─────────────────────── */

function PrefLabel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
      <span style={{ font: '500 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-strong)' }}>{children}</span>
      {note && <span style={{ font: '400 var(--text-xs)/1.3 var(--font-body)', color: 'var(--text-muted)' }}>{note}</span>}
    </label>
  )
}

function PrefInput({
  value,
  onChange,
  onBlur,
  placeholder,
  prefix,
  type = 'text',
  inputMode,
  style: s = {},
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  prefix?: ReactNode
  type?: string
  inputMode?: 'text' | 'decimal' | 'numeric'
  style?: CSSProperties
}) {
  const [focus, setFocus] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        padding: '0 14px',
        background: 'var(--surface)',
        border: `1.5px solid ${focus ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        transition: 'border-color var(--dur-fast) var(--ease-standard)',
        boxShadow: focus ? '0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent)' : 'none',
        ...s,
      }}
    >
      {prefix && <span style={{ font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)', flexShrink: 0 }}>{prefix}</span>}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false)
          onBlur?.()
        }}
        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}
      />
    </div>
  )
}

/** Compensation currency field — `$`-prefixed, parent formats on blur. */
function CompField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  placeholder: string
}) {
  return (
    <div>
      <PrefLabel>{label}</PrefLabel>
      <PrefInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        prefix="$"
        placeholder={placeholder}
        inputMode="decimal"
      />
    </div>
  )
}

function PrefTagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  max,
  note,
}: {
  tags: string[]
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  placeholder?: string
  max?: number
  note?: ReactNode
}) {
  const [inp, setInp] = useState('')
  const [focus, setFocus] = useState(false)
  const add = (raw: string) => {
    const val = raw.trim()
    if (val && !tags.includes(val) && (!max || tags.length < max)) {
      onAdd(val)
      setInp('')
    }
  }
  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 7,
          minHeight: 48,
          padding: 10,
          background: 'var(--surface)',
          border: `1.5px solid ${focus ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          cursor: 'text',
          transition: 'border-color var(--dur-fast) var(--ease-standard)',
          boxShadow: focus ? '0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent)' : 'none',
        }}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="bkt-press"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px 4px 11px',
              background: 'var(--accent)',
              borderRadius: 'var(--radius-pill)',
              font: '500 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-strong)',
            }}
          >
            {t}
            <button
              onClick={() => onRemove(t)}
              style={{
                display: 'inline-flex',
                padding: 2,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '50%',
                color: 'var(--text-muted)',
                transition: 'background var(--dur-fast)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bkt-zinc-300)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(inp)
            }
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false)
            if (inp.trim()) add(inp)
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            flex: 1,
            minWidth: 140,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            font: '400 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-strong)',
            padding: '4px 4px',
          }}
        />
      </div>
      {(note || max) && (
        <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between' }}>
          {note && <span style={{ font: '400 var(--text-xs)/1 var(--font-body)', color: 'var(--text-muted)' }}>{note}</span>}
          {max && (
            <span style={{ font: '500 var(--text-xs)/1 var(--font-mono)', color: tags.length >= max ? 'var(--bkt-danger-ink)' : 'var(--text-muted)' }}>
              {tags.length}/{max}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PrefToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bkt-press"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 14px',
        background: active ? 'var(--primary)' : 'var(--surface)',
        color: active ? 'var(--primary-foreground)' : 'var(--text-body)',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        font: `${active ? 600 : 400} var(--text-sm)/1 var(--font-body)`,
        transition: 'all var(--dur-fast) var(--ease-standard)',
      }}
    >
      {active && <Icon name="check" size={13} strokeWidth={2.5} />}
      {label}
    </button>
  )
}

function PrefMultiToggle({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <PrefToggleChip key={o} label={o} active={selected.includes(o)} onClick={() => toggle(o)} />
      ))}
    </div>
  )
}

function PrefRadioCard({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bkt-press"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        background: active ? 'var(--accent)' : 'var(--surface)',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        font: `${active ? 600 : 400} var(--text-sm)/1.4 var(--font-body)`,
        color: 'var(--text-strong)',
        transition: 'all var(--dur-fast) var(--ease-standard)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          flexShrink: 0,
          border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
          background: active ? 'var(--primary)' : 'transparent',
          boxShadow: active ? 'inset 0 0 0 3px var(--surface)' : 'none',
          transition: 'all var(--dur-fast) var(--ease-standard)',
        }}
      />
      {label}
    </button>
  )
}

function PrefModeCard({
  icon,
  title,
  badge,
  description,
  active,
  onClick,
}: {
  icon: string
  title: string
  badge: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="bkt-press"
      style={{
        flex: 1,
        minWidth: 200,
        position: 'relative',
        padding: '20px 20px 20px',
        cursor: 'pointer',
        background: active ? 'color-mix(in oklab, var(--primary) 6%, var(--surface))' : 'var(--surface)',
        border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-xl)',
        transition: 'all var(--dur-base) var(--ease-standard)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
          background: active ? 'var(--primary)' : 'transparent',
          boxShadow: active ? 'inset 0 0 0 4px var(--surface)' : 'none',
          transition: 'all var(--dur-fast) var(--ease-standard)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 32, marginBottom: 10 }}>
        <Icon name={icon} size={20} color={active ? 'var(--primary)' : 'var(--text-muted)'} />
        <span style={{ font: '600 var(--text-base)/1.2 var(--font-display)', color: 'var(--text-strong)' }}>{title}</span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            font: '600 var(--text-2xs)/1.5 var(--font-body)',
            letterSpacing: 'var(--tracking-wide)',
            background: 'var(--accent)',
            color: 'var(--text-body)',
          }}
        >
          {badge}
        </span>
      </div>
      <p style={{ margin: 0, font: '400 var(--text-sm)/1.6 var(--font-body)', color: 'var(--text-muted)' }}>{description}</p>
    </div>
  )
}

function PrefSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ font: '500 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-strong)', flex: 1 }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          position: 'relative',
          cursor: 'pointer',
          background: value ? 'var(--primary)' : 'var(--bkt-zinc-300)',
          transition: 'background var(--dur-fast) var(--ease-standard)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 20 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,.25)',
            transition: 'left var(--dur-fast) var(--ease-standard)',
          }}
        />
      </div>
    </label>
  )
}

/* ─────────────────────── SECTION WRAPPER ─────────────────────── */
function PrefSection({ title, idx, children }: { title: string; idx: number; children: ReactNode }) {
  return (
    <div className="bkt-enter" style={{ animationDelay: `${idx * 55}ms`, paddingTop: 32, paddingBottom: 32, borderBottom: '1px solid var(--border)' }}>
      <h3
        style={{
          margin: '0 0 22px',
          paddingBottom: 16,
          borderBottom: '1px solid var(--border)',
          font: '500 var(--text-lg)/1.2 var(--font-display)',
          color: 'var(--text-strong)',
          letterSpacing: 'var(--tracking-tight)',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>{children}</div>
    </div>
  )
}

interface LocationPref {
  country: string
  cities: string[]
  remote: boolean
  hybrid: boolean
}

// The preference cards map onto the same review-mode setting as the dashboard
// dropdown (user_settings.review_mode) and now share REVIEW_MODES as the single
// source for order, labels, and copy — so the two surfaces stay in lockstep
// (Auto → Hybrid → Review, AiApply-mirrored). The badge tags are Preferences-
// only flair. "Hybrid" is the human label for the 'assist' mode.
const MODE_BADGES: Record<ReviewModeId, string> = {
  auto: 'Maximum speed',
  assist: 'Best of both worlds',
  review: 'Stay in control',
}

function ModeCards({ mode, onChange, stack = false }: { mode: ReviewModeId; onChange: (m: ReviewModeId) => void; stack?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', gap: 16, flexWrap: 'wrap' }}>
      {REVIEW_MODES.map((m) => (
        <PrefModeCard
          key={m.id}
          icon={m.icon}
          title={m.label}
          badge={MODE_BADGES[m.id]}
          description={m.desc}
          active={mode === m.id}
          onClick={() => onChange(m.id)}
        />
      ))}
    </div>
  )
}

/* ─────────────────────── ANSWER LIBRARY TAB ─────────────────────── */

/** Multi-line answer field — matches PrefInput's chrome but grows vertically
 *  for the longer free-text screener answers. */
function PrefTextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focus, setFocus] = useState(false)
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      placeholder={placeholder}
      rows={3}
      style={{
        width: '100%',
        resize: 'vertical',
        minHeight: 76,
        padding: '10px 14px',
        background: 'var(--surface)',
        border: `1.5px solid ${focus ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        outline: 'none',
        font: '400 var(--text-sm)/1.5 var(--font-body)',
        color: 'var(--text-strong)',
        boxShadow: focus ? '0 0 0 3px color-mix(in oklab, var(--primary) 16%, transparent)' : 'none',
        transition: 'border-color var(--dur-fast) var(--ease-standard)',
      }}
    />
  )
}

/** One saved custom screener answer — edit the answer text in place, or remove
 *  the row. The label is the stable identity (its slug is the storage key), so
 *  it is shown read-only here; re-add with a new label to create a new row. */
function AnswerRow({
  label,
  answer,
  onSave,
  onRemove,
}: {
  label: string
  answer: string
  onSave: (label: string, answer: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(answer)
  const dirty = draft !== answer
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'var(--bkt-zinc-50)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ flex: 1, font: '600 var(--text-sm)/1.4 var(--font-body)', color: 'var(--text-strong)' }}>{label}</span>
        <button
          onClick={onRemove}
          aria-label="Remove answer"
          className="bkt-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            flexShrink: 0,
            background: 'transparent',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'border-color var(--dur-fast), color var(--dur-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--bkt-danger)'
            e.currentTarget.style.color = 'var(--bkt-danger)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <Icon name="trash-2" size={14} />
        </button>
      </div>
      <PrefTextArea value={draft} onChange={setDraft} placeholder="Your answer…" />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => onSave(label, draft)}
          disabled={!dirty}
          className="bkt-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 32,
            padding: '0 14px',
            background: dirty ? 'var(--primary)' : 'var(--accent)',
            color: dirty ? 'var(--primary-foreground)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            cursor: dirty ? 'pointer' : 'default',
            font: '600 var(--text-xs)/1 var(--font-body)',
            transition: 'background var(--dur-fast) var(--ease-standard)',
          }}
        >
          <Icon name="check" size={13} />
          {dirty ? 'Save answer' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

/** Composer for a brand-new screener answer (label + answer). Clears itself on
 *  add so multiple answers can be entered in a row. */
function AnswerComposer({ onAdd }: { onAdd: (label: string, answer: string) => void }) {
  const [label, setLabel] = useState('')
  const [answer, setAnswer] = useState('')
  const ready = label.trim().length > 0
  const add = () => {
    if (!ready) return
    onAdd(label, answer)
    setLabel('')
    setAnswer('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, background: 'var(--surface)', border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <div>
        <PrefLabel note="The exact question an application asks">Question</PrefLabel>
        <PrefInput value={label} onChange={setLabel} placeholder="e.g. Why do you want to work here?" />
      </div>
      <div>
        <PrefLabel>Answer</PrefLabel>
        <PrefTextArea value={answer} onChange={setAnswer} placeholder="The reusable answer the macro should fill in…" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={add}
          disabled={!ready}
          className="bkt-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 18px',
            background: ready ? 'var(--primary)' : 'var(--accent)',
            color: ready ? 'var(--primary-foreground)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            cursor: ready ? 'pointer' : 'default',
            font: '600 var(--text-sm)/1 var(--font-body)',
            transition: 'background var(--dur-fast) var(--ease-standard)',
          }}
        >
          <Icon name="plus" size={15} />
          Add answer
        </button>
      </div>
    </div>
  )
}

function AnswerLibraryTab({
  eeo,
  answers,
  onSetEeo,
  onSaveAnswer,
  onRemoveAnswer,
}: {
  eeo: EeoDisclosures
  answers: { key: string; label: string; answer: string }[]
  onSetEeo: (key: (typeof EEO_QUESTIONS)[number]['key'], value: string) => void
  onSaveAnswer: (label: string, answer: string) => void
  onRemoveAnswer: (key: string) => void
}) {
  return (
    <>
      <p style={{ padding: '20px 0 0', margin: 0, font: '400 var(--text-sm)/1.65 var(--font-body)', color: 'var(--text-muted)', maxWidth: 680 }}>
        Save the answers that applications ask for over and over, so they can be filled in for you. Demographic questions are always optional, you can decline any of them.
      </p>

      <PrefSection title="EEO / Demographics" idx={0}>
        <p style={{ margin: 0, font: '400 var(--text-sm)/1.6 var(--font-body)', color: 'var(--text-muted)', maxWidth: 620 }}>
          Voluntary self-identification. Anything you leave on "Decline to answer" is never shared.
        </p>
        {EEO_QUESTIONS.map((q) => (
          <div key={q.key}>
            <PrefLabel>{q.label}</PrefLabel>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {q.options.map((o) => (
                <PrefToggleChip key={o} label={o} active={eeo[q.key] === o} onClick={() => onSetEeo(q.key, o)} />
              ))}
            </div>
          </div>
        ))}
      </PrefSection>

      <PrefSection title="Custom screener answers" idx={1}>
        {answers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {answers.map((a) => (
              <AnswerRow key={a.key} label={a.label} answer={a.answer} onSave={onSaveAnswer} onRemove={() => onRemoveAnswer(a.key)} />
            ))}
          </div>
        )}
        {answers.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0 4px', color: 'var(--text-muted)' }}>
            <Icon name="book-open" size={26} />
            <span style={{ font: '400 var(--text-sm)/1.5 var(--font-body)' }}>No saved answers yet. Add your first one below.</span>
          </div>
        )}
        <AnswerComposer onAdd={onSaveAnswer} />
      </PrefSection>
    </>
  )
}

/* ─────────────────────── MAIN SCREEN ─────────────────────── */
export function PreferencesScreen({ onToast }: { onToast: ToastFn }) {
  const TABS = ['Quick Settings', 'Job Preferences', 'Answer Library', 'Rejection reasons']
  const [tab, setTab] = useState('Job Preferences')
  const tabRef = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState({ left: 0, width: 0 })
  const tabBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useLayoutEffect(() => {
    const el = tabBtnRefs.current[tab]
    if (el && tabRef.current) {
      const pRect = tabRef.current.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      setBar({ left: eRect.left - pRect.left, width: eRect.width })
    }
  }, [tab])

  // Form state
  const [status, setStatus] = useState('Unemployed and really need a job')
  const [titles, setTitles] = useState([
    'Salesforce Consulting Manager',
    'Salesforce Project Manager',
    'Sr. Salesforce Consultant',
    'Salesforce Platform Lead',
    'Sales Operations Manager',
    'Senior Salesforce Administrator',
    'Salesforce Consultant',
    'Agentforce Specialist',
  ])
  const [expLevel, setExpLevel] = useState(['Senior/Lead'])
  const [industries, setIndustries] = useState(['Information Technology & Telecom'])
  const [workTypes, setWorkTypes] = useState(['Full-time', 'Contract/Freelance'])
  const [locations, setLocations] = useState<LocationPref[]>([
    {
      country: 'United States',
      cities: ['Hollywood', 'Los Angeles, California', 'Santa Monica, California', 'West Hollywood, California'],
      remote: true,
      hybrid: true,
    },
  ])
  // Compensation — four editable currency fields kept in sync via a 2080h year.
  const [minSalary, setMinSalary] = useState('150,000')
  const [maxSalary, setMaxSalary] = useState('')
  const [minHourly, setMinHourly] = useState(() => formatHourly(150000 / HOURS_PER_YEAR))
  const [maxHourly, setMaxHourly] = useState('')
  const [excluded, setExcluded] = useState(['Evertas', 'SkyView Advisors', 'PricewaterhouseCoopers'])
  const [relocation, setRelocation] = useState(false)

  // ── candidate_profiles-backed identity + eligibility ──────────────
  // The current signed-in user (AuthProvider is the single source of auth, BR-008);
  // writes are gated on a non-null id so demo/unauthed review never persists.
  const { user } = useAuth()
  const userId = user?.id ?? null
  // One consolidated form object (instead of a useState-per-field) so the mount
  // load can replace the whole identity/eligibility block in a single setState.
  const [profile, setProfile] = useState<ProfileForm>(PROFILE_FORM_DEFAULT)
  const [eeo, setEeo] = useState<EeoDisclosures>({})
  const [answers, setAnswers] = useState<{ key: string; label: string; answer: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Update a single identity/eligibility field on the consolidated form.
  const setProfileField = useCallback(
    <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
      setProfile((p) => ({ ...p, [key]: value })),
    [],
  )

  // Load the profile (+ answers) once per user. set-state-in-effect rule:
  // every setState below runs INSIDE the promise callbacks, never synchronously
  // in the effect body (mirrors AutoApplySettingsProvider's loader).
  useEffect(() => {
    if (!userId) return
    let alive = true
    fetchCandidateProfile(userId).then(
      (row) => {
        if (alive && row) {
          setProfile(profileRowToForm(row))
          setEeo(parseEeoDisclosures(row.eeo_disclosures))
        }
      },
      () => undefined,
    )
    fetchApplicationAnswers(userId).then(
      (rows) => {
        if (alive) setAnswers(rows.map((r) => ({ key: r.question_key, label: r.question_label, answer: r.answer })))
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [userId])
  // Same setting as the dashboard ReviewModeMenu (user_settings.review_mode),
  // so the mode cards and the dashboard toggle stay in lockstep.
  const [reviewMode, setReviewMode] = useReviewMode()
  const [emailCopies, setEmailCopies] = useState(true)

  const changeReviewMode = (m: ReviewModeId) => {
    setReviewMode(m)
    onToast(`Switched to ${REVIEW_MODES.find((x) => x.id === m)?.label ?? m}`, 'settings-2', 'var(--bkt-blue-300)')
  }

  const addCity = (idx: number, city: string) => setLocations((ls) => ls.map((l, i) => (i === idx ? { ...l, cities: [...l.cities, city] } : l)))
  const removeCity = (idx: number, city: string) => setLocations((ls) => ls.map((l, i) => (i === idx ? { ...l, cities: l.cities.filter((c) => c !== city) } : l)))

  const STATUS_OPTIONS = [
    'Unemployed and really need a job',
    'Unemployed but not stressed about it',
    'Badly employed and in need of a job switch',
    'Employed but open to greener pastures',
  ]
  const EXP_OPTS = ['Entry Level', 'Mid-Level', 'Senior/Lead', 'Manager', 'Director/VP', 'Executive (C-Suite)']
  const INDUSTRY_OPTS = [
    'Information Technology & Telecom',
    'Finance & Banking',
    'Healthcare',
    'E-Commerce & Retail',
    'Consulting',
    'Manufacturing',
    'Education',
    'Government & Defense',
  ]
  const WORK_OPTS = ['Full-time', 'Part-time', 'Contract/Freelance', 'Internship']
  const AUTH_OPTS = ['US Citizen', 'Permanent Resident (Green Card)', 'H-1B', 'H-4 EAD', 'OPT', 'TN (USMCA)', 'Not yet authorized']
  // requires_sponsorship is a boolean|null column; the third chip clears it back
  // to "unanswered" (null) rather than forcing a Yes/No.
  const SPONSORSHIP_OPTS: { label: string; value: boolean | null }[] = [
    { label: 'No', value: false },
    { label: 'Yes', value: true },
    { label: 'I do not wish to provide this information', value: null },
  ]

  // ── Compensation: 2080-hour work-year conversion ──────────────
  // Hourly row sits above salary only when Contract is the active direction
  // (Contract selected, Full-time not). Both/neither → salary first (default).
  const hourlyFirst =
    workTypes.includes('Contract/Freelance') && !workTypes.includes('Full-time')

  const editSalary = (
    raw: string,
    setSalaryField: (v: string) => void,
    setHourlyField: (v: string) => void,
  ) => {
    setSalaryField(raw)
    const n = parseCurrency(raw)
    setHourlyField(n === null ? '' : formatHourly(n / HOURS_PER_YEAR))
  }

  const editHourly = (
    raw: string,
    setHourlyField: (v: string) => void,
    setSalaryField: (v: string) => void,
  ) => {
    setHourlyField(raw)
    const n = parseCurrency(raw)
    setSalaryField(n === null ? '' : formatSalary(n * HOURS_PER_YEAR))
  }

  const reformatSalary = (set: (updater: (prev: string) => string) => void) =>
    set((v) => {
      const n = parseCurrency(v)
      return n === null ? '' : formatSalary(n)
    })

  const reformatHourly = (set: (updater: (prev: string) => string) => void) =>
    set((v) => {
      const n = parseCurrency(v)
      return n === null ? '' : formatHourly(n)
    })

  const salaryRow = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <CompField
        label="Min Salary:"
        value={minSalary}
        placeholder="#,##0"
        onChange={(v) => editSalary(v, setMinSalary, setMinHourly)}
        onBlur={() => reformatSalary(setMinSalary)}
      />
      <CompField
        label="Max Salary:"
        value={maxSalary}
        placeholder="#,##0"
        onChange={(v) => editSalary(v, setMaxSalary, setMaxHourly)}
        onBlur={() => reformatSalary(setMaxSalary)}
      />
    </div>
  )

  const hourlyRow = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <CompField
        label="Min Hourly Rate:"
        value={minHourly}
        placeholder="#,##0.00"
        onChange={(v) => editHourly(v, setMinHourly, setMinSalary)}
        onBlur={() => reformatHourly(setMinHourly)}
      />
      <CompField
        label="Max Hourly Rate:"
        value={maxHourly}
        placeholder="#,##0.00"
        onChange={(v) => editHourly(v, setMaxHourly, setMaxSalary)}
        onBlur={() => reformatHourly(setMaxHourly)}
      />
    </div>
  )

  // Persists the identity + eligibility + EEO patch to candidate_profiles.
  // Best-effort like persistSettings: a successful round-trip toasts success,
  // a failure surfaces the reason instead of silently dropping the edit. In
  // demo / unconfigured-Supabase mode the upsert no-ops and still confirms.
  const save = () => {
    if (saving) return
    if (!userId) {
      onToast('Preferences saved', 'circle-check', 'var(--bkt-success)')
      return
    }
    setSaving(true)
    upsertCandidateProfile(userId, formToProfilePatch(profile, eeo))
      .then(() => onToast('Preferences saved', 'circle-check', 'var(--bkt-success)'))
      .catch((err: unknown) => onToast(`Could not save — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
      .finally(() => setSaving(false))
  }

  /* ── Answer Library actions ──────────────────────────────────────── */

  // EEO is part of the candidate_profiles row; persist it with the rest of the
  // profile patch so a single upsert keeps the jsonb column authoritative.
  const setEeoField = (key: (typeof EEO_QUESTIONS)[number]['key'], value: string) => {
    const next: EeoDisclosures = { ...eeo, [key]: value }
    setEeo(next)
    if (!userId) return
    upsertCandidateProfile(userId, formToProfilePatch(profile, next)).catch((err: unknown) =>
      onToast(`Could not save — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'),
    )
  }

  // Add or update a custom screener answer. The slug is the stable storage key,
  // so re-saving the same label edits the row in place (upsert on user+key).
  const saveAnswer = (label: string, answer: string) => {
    const trimmedLabel = label.trim()
    const key = slugifyQuestionKey(trimmedLabel)
    if (!key) {
      onToast('Add a question before saving', 'circle-alert', 'var(--bkt-blue-300)')
      return
    }
    setAnswers((list) => {
      const existing = list.find((a) => a.key === key)
      if (existing) return list.map((a) => (a.key === key ? { key, label: trimmedLabel, answer } : a))
      return [...list, { key, label: trimmedLabel, answer }]
    })
    if (!userId) return
    upsertApplicationAnswer(userId, {
      question_key: key,
      question_label: trimmedLabel,
      answer,
      answer_type: 'text',
    }).catch((err: unknown) => onToast(`Could not save answer — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
  }

  const removeAnswer = (key: string) => {
    setAnswers((list) => list.filter((a) => a.key !== key))
    if (!userId) return
    deleteApplicationAnswer(userId, key).catch((err: unknown) =>
      onToast(`Could not remove answer — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'),
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* title + save row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 28px 0' }}>
          <h1 style={{ font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', margin: 0 }}>Preferences</h1>
          <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}>Auto Apply</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={save}
            disabled={saving}
            className="bkt-press"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              padding: '0 20px',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.65 : 1,
              transition: 'opacity var(--dur-fast) var(--ease-standard)',
              font: '600 var(--text-sm)/1 var(--font-body)',
            }}
          >
            <Icon name="save" size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {/* tabs */}
        <div ref={tabRef} style={{ display: 'flex', gap: 0, padding: '4px 28px 0', position: 'relative', userSelect: 'none' }}>
          {TABS.map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabBtnRefs.current[t] = el
              }}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: `${tab === t ? 600 : 400} var(--text-sm)/1 var(--font-body)`,
                color: tab === t ? 'var(--text-strong)' : 'var(--text-muted)',
                transition: 'color var(--dur-fast) var(--ease-standard)',
              }}
            >
              {t}
            </button>
          ))}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              height: 2,
              background: 'var(--primary)',
              borderRadius: 2,
              left: bar.left,
              width: bar.width,
              transition: 'left var(--dur-base) var(--ease-standard), width var(--dur-base) var(--ease-standard)',
            }}
          />
        </div>
      </div>

      {/* scrollable body */}
      <div className="bkt-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 28px 60px' }}>
        {tab === 'Quick Settings' && (
          <div key="quick" className="bkt-blur-in">
            <PrefSection title="Application Behaviour" idx={0}>
              <p style={{ margin: 0, font: '400 var(--text-sm)/1.6 var(--font-body)', color: 'var(--text-muted)', maxWidth: 620 }}>
                How should we apply to jobs for you? Pick the mode that best fits your style.
              </p>
              <ModeCards mode={reviewMode} onChange={changeReviewMode} />
              <PrefSwitch value={emailCopies} onChange={setEmailCopies} label="Receive copies of submitted applications in your personal email" />
            </PrefSection>
          </div>
        )}

        {tab === 'Job Preferences' && (
          <div key="jobprefs" className="bkt-blur-in">
            <p style={{ padding: '20px 0 0', margin: 0, font: '400 var(--text-sm)/1.65 var(--font-body)', color: 'var(--text-muted)', maxWidth: 680 }}>
              These settings help us find the right jobs for you and complete applications on your behalf. The details you share here are used both to match
              you to relevant roles and to auto-fill application forms.
            </p>

            <PrefSection title="Role & Experience" idx={0}>
              <div>
                <PrefLabel>Describe your current employment status</PrefLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {STATUS_OPTIONS.map((o) => (
                    <PrefRadioCard key={o} label={o} active={status === o} onClick={() => setStatus(o)} />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel note="Press Enter or comma to add · Max 10">What's your desired job title?</PrefLabel>
                <PrefTagInput
                  tags={titles}
                  onAdd={(v) => setTitles((t) => [...t, v])}
                  onRemove={(v) => setTitles((t) => t.filter((x) => x !== v))}
                  placeholder="e.g. Salesforce Architect"
                  max={10}
                />
              </div>
              <div>
                <PrefLabel>What's your target experience level?</PrefLabel>
                <PrefMultiToggle options={EXP_OPTS} selected={expLevel} onChange={setExpLevel} />
              </div>
              <div>
                <PrefLabel>Select industry preference</PrefLabel>
                <PrefMultiToggle options={INDUSTRY_OPTS} selected={industries} onChange={setIndustries} />
              </div>
              <div>
                <PrefLabel>What type of work are you open to?</PrefLabel>
                <PrefMultiToggle options={WORK_OPTS} selected={workTypes} onChange={setWorkTypes} />
              </div>
            </PrefSection>

            <PrefSection title="Location & Schedule" idx={1}>
              {locations.map((loc, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, background: 'var(--bkt-zinc-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <PrefLabel>Select country</PrefLabel>
                      <div
                        style={{
                          height: 44,
                          padding: '0 14px',
                          background: 'var(--surface)',
                          border: '1.5px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}>{loc.country}</span>
                        <Icon name="chevron-down" size={15} color="var(--text-muted)" />
                      </div>
                    </div>
                    <div>
                      <PrefLabel>Select cities</PrefLabel>
                      <PrefTagInput tags={loc.cities} onAdd={(v) => addCity(i, v)} onRemove={(v) => removeCity(i, v)} placeholder="Type a city..." max={10} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <PrefToggleChip label="Full remote" active={loc.remote} onClick={() => setLocations((ls) => ls.map((l, j) => (j === i ? { ...l, remote: !l.remote } : l)))} />
                    <PrefToggleChip
                      label="On-site / Hybrid"
                      active={loc.hybrid}
                      onClick={() => setLocations((ls) => ls.map((l, j) => (j === i ? { ...l, hybrid: !l.hybrid } : l)))}
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() => setLocations((ls) => [...ls, { country: 'United States', cities: [], remote: true, hybrid: false }])}
                className="bkt-press"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 38,
                  padding: '0 16px',
                  background: 'transparent',
                  border: '1.5px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  font: '500 var(--text-sm)/1 var(--font-body)',
                  color: 'var(--text-muted)',
                  transition: 'all var(--dur-fast) var(--ease-standard)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                  e.currentTarget.style.color = 'var(--primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <Icon name="plus" size={15} />
                Add Another Location
              </button>
              <PrefSwitch value={relocation} onChange={setRelocation} label="Open to relocation" />
            </PrefSection>

            <PrefSection title="Compensation" idx={2}>
              {/* Standard-width inputs in the left half of the section —
                  not stretched flush to the full section width. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: '50%' }}>
                {hourlyFirst ? (
                  <>
                    {hourlyRow}
                    {salaryRow}
                  </>
                ) : (
                  <>
                    {salaryRow}
                    {hourlyRow}
                  </>
                )}
              </div>
            </PrefSection>

            <PrefSection title="Filtering" idx={3}>
              <div>
                <PrefLabel note={`${excluded.length}/5 — Press Enter to add`}>Want to exclude certain companies?</PrefLabel>
                <PrefTagInput
                  tags={excluded}
                  onAdd={(v) => setExcluded((e) => [...e, v])}
                  onRemove={(v) => setExcluded((e) => e.filter((x) => x !== v))}
                  placeholder="e.g. Meta..."
                  max={5}
                />
              </div>
            </PrefSection>

            <PrefSection title="Eligibility" idx={4}>
              <div>
                <PrefLabel>What's your work authorization status?</PrefLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ font: '500 var(--text-sm)/1', color: 'var(--text-muted)' }}>🇺🇸 United States</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {AUTH_OPTS.map((o) => (
                    <PrefRadioCard key={o} label={o} active={profile.work_authorization === o} onClick={() => setProfileField('work_authorization', o)} />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel>Will you now or in the future require visa sponsorship for employment?</PrefLabel>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SPONSORSHIP_OPTS.map((o) => (
                    <PrefToggleChip
                      key={o.label}
                      label={o.label}
                      active={profile.requires_sponsorship === o.value}
                      onClick={() => setProfileField('requires_sponsorship', o.value)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel>Do you currently have an active United States security clearance?</PrefLabel>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['No', 'Yes', 'I do not wish to provide this information'].map((o) => (
                    <PrefToggleChip key={o} label={o} active={profile.security_clearance === o} onClick={() => setProfileField('security_clearance', o)} />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel>Do you have a current driver's license?</PrefLabel>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['Yes', 'No', 'I do not wish to provide this information'].map((o) => (
                    <PrefToggleChip key={o} label={o} active={profile.drivers_license === o} onClick={() => setProfileField('drivers_license', o)} />
                  ))}
                </div>
              </div>
            </PrefSection>

            <PrefSection title="Personal Information" idx={5}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <PrefLabel>First name</PrefLabel>
                  <PrefInput value={profile.first_name} onChange={(v) => setProfileField('first_name', v)} placeholder="John" />
                </div>
                <div>
                  <PrefLabel>Last name</PrefLabel>
                  <PrefInput value={profile.last_name} onChange={(v) => setProfileField('last_name', v)} placeholder="Burkhardt" />
                </div>
                <div>
                  <PrefLabel note="Goes on applications that ask for a preferred / first name">Preferred name</PrefLabel>
                  <PrefInput value={profile.preferred_name} onChange={(v) => setProfileField('preferred_name', v)} placeholder="John" />
                </div>
                <div>
                  <PrefLabel>Email address</PrefLabel>
                  <PrefInput value={profile.email} onChange={(v) => setProfileField('email', v)} type="email" placeholder="you@company.com" />
                </div>
                <div>
                  <PrefLabel>Phone</PrefLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      style={{
                        height: 44,
                        padding: '0 12px',
                        background: 'var(--surface)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}>🇺🇸 +1</span>
                      <Icon name="chevron-down" size={13} color="var(--text-muted)" />
                    </div>
                    <PrefInput value={profile.phone} onChange={(v) => setProfileField('phone', v)} type="tel" inputMode="text" placeholder="(555) 000-0000" style={{ flex: 1 }} />
                  </div>
                </div>
                <div>
                  <PrefLabel>City</PrefLabel>
                  <PrefInput value={profile.location} onChange={(v) => setProfileField('location', v)} placeholder="Los Angeles" />
                </div>
                <div>
                  <PrefLabel>State</PrefLabel>
                  <PrefInput value={profile.state} onChange={(v) => setProfileField('state', v)} placeholder="California" />
                </div>
                <div>
                  <PrefLabel>LinkedIn URL</PrefLabel>
                  <PrefInput value={profile.linkedin_url} onChange={(v) => setProfileField('linkedin_url', v)} type="url" placeholder="linkedin.com/in/..." />
                </div>
                <div>
                  <PrefLabel note="Optional — portfolio, GitHub, or personal site">Website</PrefLabel>
                  <PrefInput value={profile.website_url} onChange={(v) => setProfileField('website_url', v)} type="url" placeholder="yoursite.com" />
                </div>
              </div>

              {/* Profile photo upload */}
              <div>
                <PrefLabel note="Used to auto-fill application forms that require a profile picture">Upload a profile photo</PrefLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2.5px solid var(--bkt-blue-700)', display: 'block' }}>
                    <img
                      src={brandAsset('/brand/avatar.jpg')}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
                    />
                  </span>
                  <button
                    className="bkt-press"
                    onClick={() => onToast('Photo upload coming soon', 'camera', 'var(--bkt-blue-300)')}
                    style={{
                      height: 38,
                      padding: '0 18px',
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border)',
                      borderRadius: 'var(--radius-pill)',
                      cursor: 'pointer',
                      font: '500 var(--text-sm)/1 var(--font-body)',
                      color: 'var(--text-strong)',
                    }}
                  >
                    Upload
                  </button>
                </div>
              </div>

              {/* Resume upload */}
              <div>
                <PrefLabel>Upload your resume</PrefLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <Icon name="file-text" size={20} color="var(--primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '500 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-strong)' }}>John Burkhardt - Resume (Final) - 06.2026.pdf</div>
                    <div style={{ font: '400 var(--text-xs)/1.3 var(--font-body)', color: 'var(--text-muted)' }}>Auto Apply · PDF, DOCX</div>
                  </div>
                  <button
                    className="bkt-press"
                    onClick={() => onToast('Resume upload coming soon', 'upload', 'var(--bkt-blue-300)')}
                    style={{
                      height: 34,
                      padding: '0 14px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: 'var(--radius-pill)',
                      cursor: 'pointer',
                      font: '500 var(--text-sm)/1 var(--font-body)',
                      color: 'var(--text-strong)',
                    }}
                  >
                    Replace
                  </button>
                </div>
              </div>
            </PrefSection>

            <PrefSection title="Application Behaviour" idx={6}>
              {/* Mirror the compensation treatment — half-width block with the
                  mode cards stacked rather than stretched across the section. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: '50%' }}>
                <ModeCards mode={reviewMode} onChange={changeReviewMode} stack />
                <PrefSwitch value={emailCopies} onChange={setEmailCopies} label="Receive copies of submitted applications in your personal email" />
              </div>
            </PrefSection>

            <div style={{ paddingTop: 28, paddingBottom: 8 }}>
              <button
                onClick={save}
                disabled={saving}
                className="bkt-press"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 44,
                  padding: '0 32px',
                  background: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.65 : 1,
                  transition: 'opacity var(--dur-fast) var(--ease-standard)',
                  font: '600 var(--text-base)/1 var(--font-body)',
                }}
              >
                <Icon name="save" size={16} />
                {saving ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {tab === 'Answer Library' && (
          <div key="answers" className="bkt-blur-in">
            <AnswerLibraryTab
              eeo={eeo}
              answers={answers}
              onSetEeo={setEeoField}
              onSaveAnswer={saveAnswer}
              onRemoveAnswer={removeAnswer}
            />
          </div>
        )}

        {tab === 'Rejection reasons' && (
          <div
            key="rejection"
            className="bkt-blur-in"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: 'var(--text-muted)' }}
          >
            <Icon name="thumbs-down" size={32} />
            <span style={{ font: '600 var(--text-lg)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>Rejection reasons</span>
            <span style={{ font: '400 var(--text-sm)/1.5 var(--font-body)' }}>This section is coming soon.</span>
          </div>
        )}
      </div>
    </div>
  )
}
