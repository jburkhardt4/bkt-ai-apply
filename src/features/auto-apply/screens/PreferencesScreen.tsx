// BKT AI-Apply — Preferences screen.
// Ported 1:1 from the design-system UI kit (PreferencesScreen.jsx).
// Sections: Role & Experience · Location · Compensation · Filtering ·
//           Eligibility · Personal Info · Application Behaviour
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import type { ToastFn } from '@/components/bkt/toast'
import { brandAsset } from '../assets'

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

function ModeCards({ appMode, setAppMode, stack = false }: { appMode: string; setAppMode: (m: string) => void; stack?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', gap: 16, flexWrap: 'wrap' }}>
      <PrefModeCard
        icon="user-round"
        title="Hybrid mode"
        badge="Best of both worlds"
        active={appMode === 'hybrid'}
        onClick={() => setAppMode('hybrid')}
        description="Best balance of speed and control. We auto-apply to high-fit jobs instantly, and queue lower-fit jobs for your review before sending."
      />
      <PrefModeCard
        icon="zap"
        title="Auto mode"
        badge="Save time"
        active={appMode === 'auto'}
        onClick={() => setAppMode('auto')}
        description="Save time, no approval needed. We apply to all matching jobs automatically as they appear, so you never miss an opportunity."
      />
      <PrefModeCard
        icon="eye"
        title="Review mode"
        badge="Stay in control"
        active={appMode === 'review'}
        onClick={() => setAppMode('review')}
        description="Review and approve each job before we apply. Perfect if you want full visibility on every application that goes out."
      />
    </div>
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
  const [workAuth, setWorkAuth] = useState('US Citizen')
  const [clearance, setClearance] = useState('No')
  const [driverLic, setDriverLic] = useState('Yes')
  const [fullName, setFullName] = useState('John Burkhardt')
  const [linkedin, setLinkedin] = useState('linkedin.com/in/johnburkhardt')
  const [phone, setPhone] = useState('(555) 867-5309')
  const [email, setEmail] = useState('john@bktadvisory.com')
  const [relocation, setRelocation] = useState(false)
  const [appMode, setAppMode] = useState('hybrid')
  const [emailCopies, setEmailCopies] = useState(true)

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

  const save = () => onToast('Preferences saved', 'circle-check', 'var(--bkt-success)')

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
              cursor: 'pointer',
              font: '600 var(--text-sm)/1 var(--font-body)',
            }}
          >
            <Icon name="save" size={14} />
            Save
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
              <ModeCards appMode={appMode} setAppMode={setAppMode} />
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
                    <PrefRadioCard key={o} label={o} active={workAuth === o} onClick={() => setWorkAuth(o)} />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel>Do you currently have an active United States security clearance?</PrefLabel>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['No', 'Yes', 'I do not wish to provide this information'].map((o) => (
                    <PrefToggleChip key={o} label={o} active={clearance === o} onClick={() => setClearance(o)} />
                  ))}
                </div>
              </div>
              <div>
                <PrefLabel>Do you have a current driver's license?</PrefLabel>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['Yes', 'No', 'I do not wish to provide this information'].map((o) => (
                    <PrefToggleChip key={o} label={o} active={driverLic === o} onClick={() => setDriverLic(o)} />
                  ))}
                </div>
              </div>
            </PrefSection>

            <PrefSection title="Personal Information" idx={5}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <PrefLabel>Full name</PrefLabel>
                  <PrefInput value={fullName} onChange={setFullName} placeholder="John Burkhardt" />
                </div>
                <div>
                  <PrefLabel>LinkedIn URL</PrefLabel>
                  <PrefInput value={linkedin} onChange={setLinkedin} placeholder="linkedin.com/in/..." />
                </div>
                <div>
                  <PrefLabel>Email address</PrefLabel>
                  <PrefInput value={email} onChange={setEmail} placeholder="you@company.com" />
                </div>
                <div>
                  <PrefLabel>Phone number</PrefLabel>
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
                    <PrefInput value={phone} onChange={setPhone} placeholder="(555) 000-0000" style={{ flex: 1 }} />
                  </div>
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
                <ModeCards appMode={appMode} setAppMode={setAppMode} stack />
                <PrefSwitch value={emailCopies} onChange={setEmailCopies} label="Receive copies of submitted applications in your personal email" />
              </div>
            </PrefSection>

            <div style={{ paddingTop: 28, paddingBottom: 8 }}>
              <button
                onClick={save}
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
                  cursor: 'pointer',
                  font: '600 var(--text-base)/1 var(--font-body)',
                }}
              >
                <Icon name="save" size={16} />
                Save Preferences
              </button>
            </div>
          </div>
        )}

        {(tab === 'Answer Library' || tab === 'Rejection reasons') && (
          <div
            key={tab}
            className="bkt-blur-in"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: 'var(--text-muted)' }}
          >
            <Icon name={tab === 'Answer Library' ? 'book-open' : 'thumbs-down'} size={32} />
            <span style={{ font: '600 var(--text-lg)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>{tab}</span>
            <span style={{ font: '400 var(--text-sm)/1.5 var(--font-body)' }}>This section is coming soon.</span>
          </div>
        )}
      </div>
    </div>
  )
}
