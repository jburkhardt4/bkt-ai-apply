// BKT AI-Apply — Saved Jobs screen.
// Ported 1:1 from the design-system UI kit (SavedScreen.jsx).
import { useEffect, useState } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktAvatar } from '@/components/bkt/BktAvatar'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { companyLogo } from '@/components/bkt/format'
import type { ToastFn } from '@/components/bkt/toast'
import type { SavedJob } from '../types'

/** Avatar for a saved job: real logo when a domain is known, building glyph otherwise. */
function SavedAvatar({ job, size = 46 }: { job: SavedJob; size?: number }) {
  if (job.domain) return <BktAvatar name={job.company || job.title} src={companyLogo(job.domain)} size={size} square />
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        background: 'var(--bkt-zinc-100)',
        borderRadius: 'var(--radius-lg)',
        color: 'var(--bkt-zinc-400)',
      }}
    >
      <Icon name="building-2" size={Math.round(size * 0.44)} />
    </span>
  )
}

function SavedChip({ children }: { children: string }) {
  return (
    <span
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
      {children}
    </span>
  )
}

function SavedJobCard({
  job,
  applied,
  onShowDetails,
  onDelete,
}: {
  job: SavedJob
  applied: boolean
  onShowDetails: (job: SavedJob) => void
  onDelete: (job: SavedJob) => void
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <SavedAvatar job={job} />
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
          {job.company && (
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
              {job.industry ? (
                <span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  {job.industry}
                </span>
              ) : null}
            </span>
          )}
        </div>
        <span style={{ flexShrink: 0, paddingLeft: 8, font: '400 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Saved&nbsp;&nbsp;{job.saved}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {job.chips.map((c) => (
          <SavedChip key={c}>{c}</SavedChip>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <BktButton variant="primary" size="md" onClick={() => onShowDetails(job)}>
          Show Details
        </BktButton>
        <div style={{ flex: 1 }}></div>
        {applied && (
          <BktBadge tone="success" appearance="soft" style={{ height: 36, padding: '0 14px' }}>
            <Icon name="circle-check" size={14} strokeWidth={2} /> Application Queued
          </BktBadge>
        )}
        <BktButton variant="secondary" size="md" style={{ width: 96 }} onClick={() => onDelete(job)} iconLeft={<Icon name="trash-2" size={15} />}>
          Delete
        </BktButton>
      </div>
    </article>
  )
}

function SavedDetailsModal({
  job,
  applied,
  onClose,
  onAutoApply,
}: {
  job: SavedJob | null
  applied: boolean
  onClose: () => void
  onAutoApply: (job: SavedJob) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!job) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0, 24, 72, 0.24)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}></div>
      <div
        className="bkt-enter"
        style={{
          position: 'relative',
          width: 'min(750px, 92vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="bkt-press"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <Icon name="x" size={15} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SavedAvatar job={job} size={48} />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h3 style={{ margin: 0, font: '600 var(--text-lg)/1.3 var(--font-display)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text-strong)' }}>
              {job.title}
            </h3>
            {job.company && <span style={{ font: '400 var(--text-sm)/1.3 var(--font-body)', color: 'var(--text-muted)' }}>{job.company}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span></span>
          <span style={{ font: '400 var(--text-sm)/1 var(--font-body)', color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{job.saved}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(job.allChips || job.chips).map((c) => (
            <SavedChip key={c}>{c}</SavedChip>
          ))}
        </div>

        <p style={{ margin: 0, font: '400 var(--text-base)/1.65 var(--font-body)', color: 'var(--text-body)' }}>{job.desc}</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          {applied ? (
            <BktBadge tone="success" appearance="soft" style={{ height: 40, padding: '0 16px' }}>
              <Icon name="circle-check" size={15} strokeWidth={2} /> Application Queued
            </BktBadge>
          ) : (
            <BktButton variant="primary" size="md" iconLeft={<Icon name="sparkles" size={15} />} onClick={() => onAutoApply(job)}>
              Auto Apply
            </BktButton>
          )}
        </div>
      </div>
    </div>
  )
}

export interface SavedScreenProps {
  jobs: SavedJob[]
  appliedIds: Set<string>
  onDelete: (job: SavedJob) => void
  onAutoApply: (job: SavedJob) => void
  onToast: ToastFn
}

export function SavedScreen({ jobs, appliedIds, onDelete, onAutoApply, onToast }: SavedScreenProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const openJob = jobs.find((j) => j.id === openId) ?? null

  const refresh = () => {
    setSpinning(true)
    setTimeout(() => {
      setSpinning(false)
      onToast('Saved Jobs up to date', 'refresh-ccw', 'var(--bkt-blue-300)')
    }, 700)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* sticky page header */}
      <div style={{ padding: '18px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <h1 style={{ margin: 0, font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', color: 'var(--text-strong)' }}>
            Saved Jobs
          </h1>
          <p style={{ margin: 0, font: '400 var(--text-sm)/1.55 var(--font-body)', color: 'var(--text-muted)' }}>
            These are all your saved jobs. You can remove them or save new ones directly in the job board.
          </p>
        </div>
        <BktButton variant="primary" size="lg" loading={spinning} onClick={refresh} iconLeft={!spinning ? <Icon name="refresh-ccw" size={15} /> : null}>
          Refresh
        </BktButton>
      </div>

      <div className="bkt-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {jobs.length === 0 ? (
          <div className="bkt-enter" style={{ padding: '64px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <Icon name="bookmark" size={26} />
            <span style={{ font: '600 var(--text-md)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>No saved jobs yet</span>
            <span style={{ font: '400 var(--text-sm)/1.4 var(--font-body)' }}>Save a job from the Job Search board and it will appear here.</span>
          </div>
        ) : (
          <div className="bkt-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 28px 26px' }}>
            {jobs.map((job) => (
              <SavedJobCard key={job.id} job={job} applied={appliedIds.has(job.id)} onShowDetails={(j) => setOpenId(j.id)} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>

      <SavedDetailsModal job={openJob} applied={openJob ? appliedIds.has(openJob.id) : false} onClose={() => setOpenId(null)} onAutoApply={(j) => onAutoApply(j)} />
    </div>
  )
}
