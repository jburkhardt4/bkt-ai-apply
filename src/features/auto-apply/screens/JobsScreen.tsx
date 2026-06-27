// BKT AI-Apply — "Your Jobs" screen: stat row, filter tabs, jobs table.
// Ported 1:1 from the design-system UI kit (JobsScreen.jsx).
import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktCard, BktStatCard } from '@/components/bkt/BktCard'
import { BktInput } from '@/components/bkt/BktInput'
import { JobRow } from '@/components/bkt/JobRow'
import { BktPagination } from '@/components/bkt/BktPagination'
import { BktBadge } from '@/components/bkt/BktBadge'
import { SearchingPanel } from './SearchingPanel'
import { companyLogo } from '@/components/bkt/format'
import { PAGE_SIZE, getPageCount } from '@/lib/pagination'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { JobMatch } from '../types'

function FilterTab({ label, count, badge, active, onClick }: { label: string; count?: number; badge?: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 40,
        padding: '0 4px',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
        font: '600 var(--text-base)/1 var(--font-body)',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'color var(--dur-fast) var(--ease-standard)',
      }}
    >
      {label}
      {badge != null
        ? badge
        : count != null && <span style={{ font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-subtle)' }}>{count}</span>}
    </button>
  )
}

/** Sort cycle for the Sort button (audit §6 #6 — was a dead no-op). */
const SORT_MODES: { label: string; cmp: (a: JobMatch, b: JobMatch) => number }[] = [
  { label: 'Score ↓', cmp: (a, b) => b.score - a.score },
  { label: 'Score ↑', cmp: (a, b) => a.score - b.score },
  { label: 'Company', cmp: (a, b) => a.company.localeCompare(b.company) },
]

/** Per-column filter dropdown (audit §6 #3 — ported from the prospector table).
 *  Renders nothing when the column has no values in view. */
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  if (options.length === 0) return null
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{
        height: 32,
        padding: '0 8px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${value ? 'var(--primary)' : 'var(--border)'}`,
        background: 'var(--surface)',
        color: value ? 'var(--text-strong)' : 'var(--text-muted)',
        font: '500 var(--text-sm)/1 var(--font-body)',
        cursor: 'pointer',
      }}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

export interface JobsScreenProps {
  jobs: JobMatch[]
  stats: { submitted: number; matches: number }
  onOpenJob: (id: JobMatch['id']) => void
  onApply: (id: JobMatch['id']) => void
  onDecline: (id: JobMatch['id']) => void
  onViewApplication: (id: JobMatch['id']) => void
  selectedId: JobMatch['id'] | null
  paused: boolean
  /** A prospector run kicked off from Resume is in flight — show the searching panel. */
  searching?: boolean
  onTogglePause: () => void
  onRefresh?: () => void
  showComp?: boolean
}

export function JobsScreen({
  jobs,
  stats,
  onOpenJob,
  onApply,
  onDecline,
  onViewApplication,
  selectedId,
  paused,
  searching = false,
  onTogglePause,
  onRefresh,
  showComp = true,
}: JobsScreenProps) {
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState('Review Matches')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sortIdx, setSortIdx] = useState(0)
  // Per-column filters (audit §6 #3 — ported from the prospector table).
  const [typeFilter, setTypeFilter] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  // Reset to the first page whenever the active tab changes so navigation never
  // lands on an out-of-range page.
  const selectFilter = (next: string) => {
    setFilter(next)
    setPage(0)
  }
  // Any column/search filter change returns to page 0 for the same reason.
  const onColumnFilter = (set: (v: string) => void) => (v: string) => {
    set(v)
    setPage(0)
  }

  const reviewCount = jobs.filter((j) => j.status === 'Review').length
  const inProgressCount = jobs.filter((j) => j.status === 'In progress').length
  const declinedCount = jobs.filter((j) => j.status === 'Declined').length

  // Distinct per-column filter options from the data currently in view.
  const uniq = (vals: (string | undefined)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort()
  const typeOptions = uniq(jobs.map((j) => j.jobType))
  const envOptions = uniq(jobs.map((j) => j.remoteType))
  const sourceOptions = uniq(jobs.map((j) => j.sourceBoard))

  const filtered = jobs.filter((j) => {
    const f =
      filter === 'All'
        ? true
        : filter === 'Review Matches'
          ? j.status === 'Review'
          : filter === 'In progress'
            ? j.status === 'In progress'
            : filter === 'Applied'
              ? j.status === 'Applied'
              : j.status === 'Declined'
    const q = query.trim().toLowerCase()
    return (
      f &&
      (!q || j.company.toLowerCase().includes(q) || j.title.toLowerCase().includes(q)) &&
      (!typeFilter || j.jobType === typeFilter) &&
      (!envFilter || j.remoteType === envFilter) &&
      (!sourceFilter || j.sourceBoard === sourceFilter)
    )
  })

  const sorted = [...filtered].sort(SORT_MODES[sortIdx].cmp)

  // Client-side pagination of the filtered + sorted rows (data is already in
  // memory; safePage clamps if the set shrinks under optimistic apply/decline).
  const pageCount = getPageCount(sorted.length)
  const safePage = Math.min(page, pageCount - 1)
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Toolbar controls (filters · search · sort/refresh). Defined once and arranged
  // differently per breakpoint below: on mobile they stack into three rows — the
  // dropdowns right-aligned, a full-width search, and Sort/Refresh as two equal
  // full-width halves — while desktop keeps them inline on one wrapping row.
  const filterDropdowns = (
    <>
      <FilterSelect label="Type" value={typeFilter} options={typeOptions} onChange={onColumnFilter(setTypeFilter)} />
      <FilterSelect label="Environment" value={envFilter} options={envOptions} onChange={onColumnFilter(setEnvFilter)} />
      <FilterSelect label="Source" value={sourceFilter} options={sourceOptions} onChange={onColumnFilter(setSourceFilter)} />
    </>
  )
  const searchInput = (
    <BktInput
      size="sm"
      placeholder="Search jobs or companies..."
      value={query}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value)
        setPage(0)
      }}
      iconLeft={<Icon name="search" size={14} />}
      style={{ width: isMobile ? '100%' : 230 }}
    />
  )
  // flex:1 on mobile makes the two buttons equal halves that sit flush to both
  // edges of the row; their content is centered by BktButton's default.
  const sortButton = (
    <BktButton
      variant="outline"
      size="sm"
      iconLeft={<Icon name="arrow-up-down" size={14} />}
      onClick={() => setSortIdx((i) => (i + 1) % SORT_MODES.length)}
      style={isMobile ? { flex: 1 } : undefined}
    >
      Sort: {SORT_MODES[sortIdx].label}
    </BktButton>
  )
  const refreshButton = (
    <BktButton
      variant="outline"
      size="sm"
      iconLeft={<Icon name="refresh-cw" size={14} />}
      onClick={onRefresh}
      style={isMobile ? { flex: 1 } : undefined}
    >
      Refresh
    </BktButton>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: isMobile ? '0 16px 24px' : '0 28px 28px' }}>
      <div className="bkt-stagger" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.25fr 1fr 1fr', gap: 16 }}>
        <BktStatCard
          live={!paused}
          label={paused ? 'Paused' : 'Searching Now'}
          liveText={paused ? 'Job search is paused' : 'We are gathering matching jobs'}
          action={
            <BktButton
              variant="outline"
              size="sm"
              style={{ borderRadius: 'var(--radius-pill)' }}
              iconLeft={<Icon name={paused ? 'play' : 'pause'} size={14} />}
              onClick={onTogglePause}
            >
              {paused ? 'Resume' : 'Pause'}
            </BktButton>
          }
        />
        <BktStatCard label="Applications Submitted" value={stats.submitted} />
        <BktStatCard label="Job Matches Found" value={stats.matches} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 22, borderBottom: '1px solid var(--border)', flexWrap: isMobile ? 'wrap' : undefined }}>
        <FilterTab label="All" count={stats.matches} active={filter === 'All'} onClick={() => selectFilter('All')} />
        <FilterTab label="Review Matches" count={reviewCount} badge={reviewCount > 0 ? <BktBadge tone="brand" appearance="soft" style={{ border: '1px solid var(--bkt-blue-200)' }}>{reviewCount}</BktBadge> : undefined} active={filter === 'Review Matches'} onClick={() => selectFilter('Review Matches')} />
        <FilterTab label="In progress" count={inProgressCount} active={filter === 'In progress'} onClick={() => selectFilter('In progress')} />
        <FilterTab label="Applied" count={stats.submitted} active={filter === 'Applied'} onClick={() => selectFilter('Applied')} />
        <FilterTab label="Declined" count={declinedCount} active={filter === 'Declined'} onClick={() => selectFilter('Declined')} />
        <div style={{ flex: 1 }}></div>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 6, width: '100%' }}>
            {/* Dropdowns aligned to the right edge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{filterDropdowns}</div>
            {searchInput}
            {/* Sort + Refresh: equal halves, flush to both edges */}
            <div style={{ display: 'flex', gap: 10 }}>
              {sortButton}
              {refreshButton}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6, flexWrap: 'wrap' }}>
            {filterDropdowns}
            {searchInput}
            {sortButton}
            {refreshButton}
          </div>
        )}
      </div>

      {searching && <SearchingPanel />}

      <BktCard padding={0} radius="xl">
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showComp
                ? 'minmax(200px, 1fr) minmax(230px, 1.4fr) 122px 110px 170px'
                : 'minmax(220px, 1.1fr) minmax(260px, 1.6fr) 110px 170px',
              gap: 16,
              padding: '10px 18px',
              borderBottom: '1px solid var(--border)',
              font: '600 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-muted)',
            }}
          >
            <span>Company Name</span>
            <span>Job Posting</span>
            {showComp && <span>Compensation</span>}
            <span>Updated At</span>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
        )}
        <div className="bkt-stagger-rows">
          {paged.map((j, i) => (
            <JobRow
              key={j.id}
              company={j.company}
              logoSrc={companyLogo(j.domain)}
              title={j.title}
              score={j.score}
              status={j.status}
              source={j.source}
              sourceBoard={j.sourceBoard}
              jobType={j.jobType}
              remoteType={j.remoteType}
              comp={showComp ? j.comp || '—' : null}
              updatedAt={j.updated}
              selected={selectedId === j.id}
              applyLabel={j.status === 'In progress' ? 'Mark as applied' : 'Apply'}
              isMobile={isMobile}
              onClick={() => onOpenJob(j.id)}
              onApply={() => onApply(j.id)}
              onDecline={() => onDecline(j.id)}
              onViewApplication={() => onViewApplication(j.id)}
              style={i === paged.length - 1 ? { borderBottom: 'none' } : undefined}
            />
          ))}
        </div>
        {sorted.length === 0 && (
          <div style={{ padding: '38px 18px', textAlign: 'center', color: 'var(--text-muted)', font: '400 var(--text-base)/1.5 var(--font-body)' }}>
            No jobs match this view.
          </div>
        )}
      </BktCard>

      <BktPagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
    </div>
  )
}
