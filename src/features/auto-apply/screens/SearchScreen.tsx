// BKT AI-Apply — Job Search screen (internal job board).
// Ported 1:1 from the design-system UI kit (SearchScreen.jsx).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktAvatar } from '@/components/bkt/BktAvatar'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { BktCheckbox, BktSkeleton } from '@/components/bkt/BktCheckbox'
import { BktInput } from '@/components/bkt/BktInput'
import { companyLogo } from '@/components/bkt/format'
import type { ToastFn } from '@/components/bkt/toast'
import type { SearchData, SearchJob } from '../types'

/* ---- filter chip + dropdown panel (Work mode / Skills / Seniority) ---- */
function FilterMenu({
  label,
  options,
  searchable = false,
  value,
  onApply,
}: {
  label: string
  options: string[]
  searchable?: boolean
  value: string[]
  onApply: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const active = value.length > 0

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px',
          background: active ? 'var(--bkt-blue-50)' : 'var(--surface)',
          border: `1px solid ${active ? 'var(--bkt-blue-300)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          font: '500 var(--text-sm)/1 var(--font-body)',
          color: active ? 'var(--bkt-blue-700)' : 'var(--text-strong)',
          transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        }}
      >
        {label}
        {active && (
          <span
            className="bkt-num"
            style={{ font: '600 11px/1 var(--font-mono)', background: 'var(--primary)', color: '#fff', borderRadius: 'var(--radius-pill)', padding: '2px 6px' }}
          >
            {value.length}
          </span>
        )}
        <Icon
          name="chevron-down"
          size={14}
          color={active ? 'var(--bkt-blue-700)' : 'var(--bkt-zinc-500)'}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
        />
      </button>

      {open && (
        <FilterPanel
          label={label}
          options={options}
          searchable={searchable}
          initial={value}
          onCancel={() => setOpen(false)}
          onApply={(next) => {
            onApply(next)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

/* Dropdown panel — mounts fresh on each open, so draft/query state starts
   from the currently applied value without any reset effect. */
function FilterPanel({
  label,
  options,
  searchable,
  initial,
  onCancel,
  onApply,
}: {
  label: string
  options: string[]
  searchable: boolean
  initial: string[]
  onCancel: () => void
  onApply: (next: string[]) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [query, setQuery] = useState('')
  const shown = searchable ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options
  const toggle = (o: string) => setDraft((d) => (d.includes(o) ? d.filter((x) => x !== o) : [...d, o]))
  return (
    <div
      className="bkt-enter"
      style={{
        position: 'absolute',
        left: 0,
        top: 'calc(100% + 8px)',
        minWidth: 256,
        zIndex: 40,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {searchable && (
        <div style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
          <Icon name="search" size={15} color="var(--bkt-zinc-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              padding: '11px 14px 11px 38px',
              font: '500 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-strong)',
            }}
          />
        </div>
      )}
      <div className="bkt-scroll" style={{ maxHeight: 240, overflowY: 'auto', padding: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {shown.map((o) => (
          <label
            key={o}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 10px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              font: '500 var(--text-sm)/1.2 var(--font-body)',
              color: 'var(--text-strong)',
              background: 'transparent',
              transition: 'background var(--dur-fast) var(--ease-standard)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bkt-zinc-100)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <BktCheckbox checked={draft.includes(o)} onChange={() => toggle(o)} size={16} />
            {o}
          </label>
        ))}
        {shown.length === 0 && (
          <div style={{ padding: '14px 12px', font: '400 var(--text-sm)/1.4 var(--font-body)', color: 'var(--text-muted)' }}>No matches.</div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          borderTop: '1px solid var(--border)',
          padding: '8px 8px 8px 14px',
        }}
      >
        <button
          onClick={onCancel}
          className="bkt-press"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
        <BktButton variant="primary" size="sm" onClick={() => onApply(draft)}>
          Show Results
        </BktButton>
      </div>
    </div>
  )
}

/* ---- sort dropdown (Most Relevant / Newest) ---- */
function SortMenu({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const OPTIONS = ['Most Relevant', 'Newest']
  return (
    <div ref={rootRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          font: '500 var(--text-sm)/1 var(--font-body)',
          color: 'var(--text-strong)',
        }}
      >
        <Icon name="arrow-up-down" size={13} color="var(--bkt-zinc-500)" />
        {value}
        <Icon
          name="chevron-down"
          size={14}
          color="var(--bkt-zinc-500)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
        />
      </button>
      {open && (
        <div
          className="bkt-enter"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 176,
            zIndex: 40,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: 5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {OPTIONS.map((o) => (
            <button
              key={o}
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              className="bkt-press"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                width: '100%',
                textAlign: 'left',
                background: o === value ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                font: '500 var(--text-sm)/1 var(--font-body)',
                color: 'var(--text-strong)',
                transition: 'background var(--dur-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => {
                if (o !== value) e.currentTarget.style.background = 'var(--bkt-zinc-100)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = o === value ? 'var(--accent)' : 'transparent'
              }}
            >
              <Icon name="check" size={15} strokeWidth={2.2} color="var(--primary)" style={{ opacity: o === value ? 1 : 0 }} />
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---- one job-board card ---- */
function SearchJobCard({
  job,
  saved,
  applied,
  onShowDetails,
  onAutoApply,
  onToggleSave,
  onToast,
}: {
  job: SearchJob
  saved: boolean
  applied: boolean
  onShowDetails: (job: SearchJob) => void
  onAutoApply: (job: SearchJob) => void
  onToggleSave: (job: SearchJob) => void
  onToast: ToastFn
}) {
  const [hover, setHover] = useState(false)
  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'box-shadow var(--dur-base) var(--ease-standard)',
      }}
    >
      {/* identity row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <BktAvatar name={job.company} src={companyLogo(job.domain)} size={46} square />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3
            style={{
              margin: 0,
              font: '600 var(--text-lg)/1.3 var(--font-display)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--text-strong)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {job.title}
          </h3>
          <span
            style={{
              font: '400 var(--text-sm)/1.3 var(--font-body)',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {job.company}
            <span style={{ margin: '0 6px' }}>·</span>
            {job.industry}
          </span>
        </div>
        <span style={{ flexShrink: 0, paddingLeft: 8, font: '400 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Posted&nbsp;&nbsp;{job.posted}
        </span>
      </div>

      {/* skill chips */}
      {job.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {job.chips.map((c) => (
            <span
              key={c}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 28,
                padding: '0 12px',
                background: 'var(--bkt-slate-50)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                font: '500 var(--text-sm)/1 var(--font-body)',
                color: 'var(--text-body)',
                whiteSpace: 'nowrap',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* action row */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <BktButton variant="primary" size="md" onClick={() => onShowDetails(job)}>
            Show Details
          </BktButton>
          <BktButton
            variant="ghost"
            size="md"
            iconRight={<Icon name="external-link" size={14} />}
            disabled={!job.source_url}
            onClick={() => {
              if (job.source_url) {
                window.open(job.source_url, '_blank', 'noopener,noreferrer')
              } else {
                onToast(`No listing URL available — ${job.company}`, 'external-link', 'var(--bkt-zinc-400)')
              }
            }}
          >
            Go to Listing
          </BktButton>
        </div>
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {applied ? (
            <BktBadge tone="success" appearance="soft" style={{ height: 36, padding: '0 14px' }}>
              <Icon name="circle-check" size={14} strokeWidth={2} /> Application Queued
            </BktBadge>
          ) : (
            <BktButton variant="ghost" size="md" onClick={() => onAutoApply(job)} iconLeft={<Icon name="sparkles" size={15} color="var(--primary)" />}>
              Auto Apply
              <span
                style={{
                  marginLeft: 7,
                  font: '600 11px/1 var(--font-mono)',
                  color: 'var(--bkt-success-ink)',
                  background: 'var(--bkt-success-soft)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 8px',
                }}
              >
                1 credit
              </span>
            </BktButton>
          )}
          <BktButton
            variant={saved ? 'outline' : 'secondary'}
            size="md"
            style={{ width: 96 }}
            onClick={() => onToggleSave(job)}
            iconLeft={<Icon name={saved ? 'bookmark-check' : 'bookmark'} size={15} color={saved ? 'var(--primary)' : 'currentColor'} />}
          >
            {saved ? 'Saved' : 'Save'}
          </BktButton>
        </div>
      </div>
    </article>
  )
}

function SearchCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-sm)',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <BktSkeleton shape="rect" width={46} height={46} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <BktSkeleton shape="text" width="46%" />
          <BktSkeleton shape="text" width="28%" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <BktSkeleton shape="pill" width={120} height={28} />
        <BktSkeleton shape="pill" width={90} height={28} />
        <BktSkeleton shape="pill" width={140} height={28} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <BktSkeleton shape="pill" width={118} height={36} />
        <BktSkeleton shape="pill" width={108} height={36} />
      </div>
    </div>
  )
}

/* ---- the screen ---- */
export interface SearchScreenProps {
  data: SearchData
  appliedIds: Set<string>
  saved: Set<string>
  onToggleSave: (job: SearchJob) => void
  onShowDetails: (job: SearchJob) => void
  onAutoApply: (job: SearchJob) => void
  onToast: ToastFn
}

export function SearchScreen({ data, appliedIds, saved, onToggleSave, onShowDetails, onAutoApply, onToast }: SearchScreenProps) {
  // Input text shows the seed query/location; the *applied* filters start empty
  // so the full board is visible on mount (applying the seed phrase verbatim
  // would wrongly hide everything). Search/Enter promotes the inputs to applied.
  const [query, setQuery] = useState(data.query)
  const [location, setLocation] = useState(data.location)
  const [appliedQuery, setAppliedQuery] = useState('')
  const [appliedLocation, setAppliedLocation] = useState('')
  const [workMode, setWorkMode] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [seniority, setSeniority] = useState<string[]>([])
  const [sort, setSort] = useState('Most Relevant')
  const [searching, setSearching] = useState(false)
  const [visible, setVisible] = useState(7)
  const [loadingMore, setLoadingMore] = useState(false)

  // Skill filter options reflect the real loaded board when present, falling
  // back to the seed list (demo mode / empty board).
  const skillOptions = useMemo(() => {
    const fromJobs = new Set<string>()
    for (const j of data.jobs) for (const s of j.skills ?? j.chips ?? []) fromJobs.add(s)
    return fromJobs.size > 0 ? [...fromJobs].sort((a, b) => a.localeCompare(b)) : data.skills
  }, [data.jobs, data.skills])

  // Real filter + sort over the loaded jobs (live rows in live mode). Text
  // search applies on Search/Enter; chips + sort apply immediately.
  const filteredAll = useMemo(() => {
    const norm = (s: string) => s.toLowerCase()
    const qTokens = appliedQuery.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
    const locTokens = appliedLocation.trim().toLowerCase().split(/[\s,]+/).filter((t) => t.length >= 3)

    const matchesQuery = (job: SearchJob) => {
      if (qTokens.length === 0) return true
      const hay = [job.title, job.company, job.industry, ...(job.skills ?? []), ...job.chips]
        .filter(Boolean)
        .map((f) => norm(String(f)))
        .join(' ')
      return qTokens.some((t) => hay.includes(t))
    }

    const matchesLocation = (job: SearchJob) => {
      if (locTokens.length === 0) return true
      const hay = norm(job.location ?? '')
      return locTokens.some((t) => hay.includes(t))
    }

    const matchesWorkMode = (job: SearchJob) => {
      if (workMode.length === 0) return true
      const hay = norm([job.location, ...job.chips].filter(Boolean).join(' '))
      return workMode.some((m) =>
        m === 'Remote'
          ? hay.includes('remote')
          : /hybrid|on-?site|in[ -]?office/.test(hay) || !hay.includes('remote'),
      )
    }

    const matchesSkills = (job: SearchJob) => {
      if (skills.length === 0) return true
      const set = [...(job.skills ?? []), ...job.chips].map(norm)
      return skills.some((s) => set.some((x) => x.includes(norm(s))))
    }

    const matchesSeniority = (job: SearchJob) => {
      if (seniority.length === 0) return true
      const hay = norm([job.title, job.level].filter(Boolean).join(' '))
      return seniority.some((s) => hay.includes(norm(s)))
    }

    const base = data.jobs.filter(
      (j) =>
        matchesQuery(j) &&
        matchesLocation(j) &&
        matchesWorkMode(j) &&
        matchesSkills(j) &&
        matchesSeniority(j),
    )
    // Most Relevant = match score desc; Newest = best-effort by relative-time label.
    return sort === 'Newest'
      ? [...base].sort((a, b) => (a.posted > b.posted ? 1 : a.posted < b.posted ? -1 : 0))
      : [...base].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }, [data.jobs, appliedQuery, appliedLocation, workMode, skills, seniority, sort])

  const runSearch = (msg?: string) => {
    setSearching(true)
    setAppliedQuery(query)
    setAppliedLocation(location)
    setVisible(7)
    // Brief, honest spinner; the filtering itself is synchronous over loaded rows.
    setTimeout(() => {
      setSearching(false)
      if (msg) onToast(msg, 'search', 'var(--bkt-blue-300)')
    }, 320)
  }

  const loadMore = () => {
    setLoadingMore(true)
    setTimeout(() => {
      setLoadingMore(false)
      setVisible(filteredAll.length)
    }, 400)
  }

  const shown = filteredAll.slice(0, visible)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* sticky page header */}
      <div style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <h1 style={{ margin: 0, font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', color: 'var(--text-strong)' }}>
          Search Jobs
        </h1>
        <p style={{ margin: 0, maxWidth: 980, font: '400 var(--text-sm)/1.55 var(--font-body)', color: 'var(--text-muted)' }}>
          This is our internal job board, powered by a scraper that finds more than 1M jobs per month. Jobs shown here are a small sample — Auto Apply
          searches a much wider range of listings across multiple platforms when activated.
        </p>
      </div>

      <div className="bkt-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* search row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 28px 0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BktInput
              placeholder="Job title, company, or keyword"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(`Searching "${query.trim()}"`)}
              iconLeft={<Icon name="search" size={16} color="var(--bkt-zinc-400)" />}
            />
          </div>
          <div style={{ width: 256, flexShrink: 0 }}>
            <BktInput
              placeholder="City or country"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(`Searching "${query.trim()}"`)}
              iconLeft={<Icon name="map-pin" size={16} color="var(--bkt-zinc-400)" />}
            />
          </div>
          <BktButton variant="primary" size="lg" style={{ padding: '0 26px' }} loading={searching} onClick={() => runSearch(`Searching "${query.trim()}"`)}>
            Search
          </BktButton>
        </div>

        {/* filter chips + sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px 0' }}>
          <FilterMenu
            label="Work mode"
            options={['Remote', 'On-site / Hybrid']}
            value={workMode}
            onApply={(v) => {
              setWorkMode(v)
              runSearch()
            }}
          />
          <FilterMenu
            label="Skills"
            options={skillOptions}
            searchable
            value={skills}
            onApply={(v) => {
              setSkills(v)
              runSearch()
            }}
          />
          <FilterMenu
            label="Seniority"
            options={data.seniorities}
            value={seniority}
            onApply={(v) => {
              setSeniority(v)
              runSearch()
            }}
          />
          <SortMenu
            value={sort}
            onChange={(v) => {
              setSort(v)
              runSearch(`Sorted by ${v}`)
            }}
          />
        </div>

        {/* results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 28px 10px' }}>
          {searching ? (
            [0, 1, 2, 3].map((i) => <SearchCardSkeleton key={i} />)
          ) : shown.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <Icon name="search-x" size={28} color="var(--bkt-zinc-400)" />
              <span style={{ font: '600 var(--text-md)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>No matching jobs</span>
              <span style={{ font: '400 var(--text-sm)/1.5 var(--font-body)', color: 'var(--text-muted)', maxWidth: 380 }}>
                Try a broader search term, clear a filter, or widen the location.
              </span>
            </div>
          ) : (
            <div key={`${sort}-${appliedQuery}-${shown.length}`} className="bkt-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {shown.map((job) => (
                <SearchJobCard
                  key={job.id}
                  job={job}
                  saved={saved.has(job.id)}
                  applied={appliedIds.has(job.id)}
                  onShowDetails={onShowDetails}
                  onAutoApply={onAutoApply}
                  onToggleSave={onToggleSave}
                  onToast={onToast}
                />
              ))}
            </div>
          )}
        </div>

        {/* load more */}
        {!searching && shown.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 26px' }}>
            {visible < filteredAll.length ? (
              <BktButton variant="ghost" size="md" loading={loadingMore} onClick={loadMore} iconLeft={!loadingMore ? <Icon name="refresh-cw" size={14} /> : null}>
                Load more
              </BktButton>
            ) : (
              <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}>All {filteredAll.length} matching jobs loaded.</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
