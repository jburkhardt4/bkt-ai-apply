// BKT AI-Apply — "Your Jobs" screen: stat row, filter tabs, jobs table.
// Ported 1:1 from the design-system UI kit (JobsScreen.jsx).
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktCard, BktStatCard } from '@/components/bkt/BktCard'
import { BktInput } from '@/components/bkt/BktInput'
import { JobRow } from '@/components/bkt/JobRow'
import { companyLogo } from '@/components/bkt/format'
import type { JobMatch } from '../types'

function FilterTab({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
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
      {count != null && <span style={{ font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-subtle)' }}>{count}</span>}
    </button>
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
  onTogglePause,
  onRefresh,
  showComp = true,
}: JobsScreenProps) {
  const [filter, setFilter] = useState('Review Matches')
  const [query, setQuery] = useState('')

  const reviewCount = jobs.filter((j) => j.status === 'Review').length
  const inProgressCount = jobs.filter((j) => j.status === 'In progress').length
  const declinedCount = jobs.filter((j) => j.status === 'Declined').length

  const visible = jobs.filter((j) => {
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
    return f && (!q || j.company.toLowerCase().includes(q) || j.title.toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 28px 28px' }}>
      <div className="bkt-stagger" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 16 }}>
        <BktStatCard
          live={!paused}
          label={paused ? 'Paused' : 'Searching Now'}
          liveText={paused ? 'Auto Apply is paused' : 'We are gathering matching jobs'}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, borderBottom: '1px solid var(--border)' }}>
        <FilterTab label="All" count={stats.matches} active={filter === 'All'} onClick={() => setFilter('All')} />
        <FilterTab label="Review Matches" count={reviewCount} active={filter === 'Review Matches'} onClick={() => setFilter('Review Matches')} />
        <FilterTab label="In progress" count={inProgressCount} active={filter === 'In progress'} onClick={() => setFilter('In progress')} />
        <FilterTab label="Applied" count={stats.submitted} active={filter === 'Applied'} onClick={() => setFilter('Applied')} />
        <FilterTab label="Declined" count={declinedCount} active={filter === 'Declined'} onClick={() => setFilter('Declined')} />
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
          <BktInput
            size="sm"
            placeholder="Search jobs or companies..."
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            iconLeft={<Icon name="search" size={14} />}
            style={{ width: 230 }}
          />
          <BktButton variant="outline" size="sm" iconLeft={<Icon name="arrow-up-down" size={14} />}>
            Sort
          </BktButton>
          <BktButton variant="outline" size="sm" iconLeft={<Icon name="refresh-cw" size={14} />} onClick={onRefresh}>
            Refresh
          </BktButton>
        </div>
      </div>

      <BktCard padding={0} radius="xl">
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
        <div className="bkt-stagger-rows">
          {visible.map((j, i) => (
            <JobRow
              key={j.id}
              company={j.company}
              logoSrc={companyLogo(j.domain)}
              title={j.title}
              score={j.score}
              status={j.status}
              comp={showComp ? j.comp || '—' : null}
              updatedAt={j.updated}
              selected={selectedId === j.id}
              applyLabel={j.status === 'In progress' ? 'Mark as applied' : 'Apply'}
              onClick={() => onOpenJob(j.id)}
              onApply={() => onApply(j.id)}
              onDecline={() => onDecline(j.id)}
              onViewApplication={() => onViewApplication(j.id)}
              style={i === visible.length - 1 ? { borderBottom: 'none' } : undefined}
            />
          ))}
        </div>
        {visible.length === 0 && (
          <div style={{ padding: '38px 18px', textAlign: 'center', color: 'var(--text-muted)', font: '400 var(--text-base)/1.5 var(--font-body)' }}>
            No jobs match this view.
          </div>
        )}
      </BktCard>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, color: 'var(--text-muted)' }}>
        <Icon name="arrow-left" size={16} />
        <span style={{ font: '500 var(--text-sm)/1 var(--font-body)' }}>1 of 2</span>
        <Icon name="arrow-right" size={16} color="var(--text-strong)" />
      </div>
    </div>
  )
}
