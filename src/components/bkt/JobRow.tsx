// BKT AI-Apply — JobRow (ported from the BKT design system)
// One row of the "Your Jobs" table: company avatar + name + status,
// job posting + match score, comp, updated-at, Decline/Apply actions.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BktAvatar } from './BktAvatar'
import { BktBadge } from './BktBadge'
import type { BktBadgeTone } from './BktBadge'
import { BktButton } from './BktButton'
import { Icon } from './Icon'
import { MatchScore } from './MatchScore'
import type { JobStatus } from '@/features/auto-apply/types'

export interface JobRowProps {
  company: string
  logoSrc?: string | null
  title: string
  comp?: string | null
  score?: number
  status?: JobStatus
  /** jobs.source provenance — a 'corpus' row shows a "Job Board" badge (ADR-016). */
  source?: string
  /** Real board name (Greenhouse / Ashby / Lever / …) — preferred over the
   *  generic "Job Board" badge when known (audit §6 #3). */
  sourceBoard?: string
  /** jobs.job_type — a compact chip next to the title (audit §6 #3). */
  jobType?: string
  /** jobs.remote_type — environment chip next to the title (audit §6 #3). */
  remoteType?: string
  updatedAt?: string
  onApply?: () => void
  onDecline?: () => void
  /** Applied rows show a "View Application" button (opens the board URL where the
   *  application was submitted) in place of Decline/Apply. */
  onViewApplication?: () => void
  onClick?: () => void
  selected?: boolean
  /** Success-button label. Becomes "Mark as applied" for in-progress manual rows. */
  applyLabel?: string
  /** Under 768px the row renders as a stacked, full-width card instead of a
   *  table grid (the desktop grid is ~800px wide). Desktop unchanged. */
  isMobile?: boolean
  style?: CSSProperties
}

const STATUS_TONE: Record<JobStatus, BktBadgeTone> = {
  Review: 'brand',
  'In progress': 'warning',
  Applied: 'success',
  Declined: 'danger',
}

export function JobRow({
  company,
  logoSrc = null,
  title,
  comp = null,
  score,
  status = 'Review',
  source,
  sourceBoard,
  jobType,
  remoteType,
  updatedAt = '2 hours ago',
  onApply,
  onDecline,
  onViewApplication,
  onClick,
  selected = false,
  applyLabel = 'Apply',
  isMobile = false,
  style = {},
}: JobRowProps) {
  const [hover, setHover] = useState(false)

  return (
    <div
      role="row"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: isMobile ? 'flex' : 'grid',
        flexDirection: isMobile ? 'column' : undefined,
        gridTemplateColumns: isMobile
          ? undefined
          : comp != null
            ? 'minmax(200px, 1fr) minmax(230px, 1.4fr) 122px 110px 170px'
            : 'minmax(220px, 1.1fr) minmax(260px, 1.6fr) 110px 170px',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 10 : 16,
        padding: isMobile ? '14px 16px' : '12px 18px',
        background: selected ? 'var(--accent)' : hover ? 'var(--bkt-slate-50)' : 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: isMobile ? 'wrap' : undefined }}>
        <BktAvatar name={company} src={logoSrc} size={30} square />
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-strong)',
            fontSize: 'var(--text-base)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {company}
        </span>
        <BktBadge tone={STATUS_TONE[status]} appearance="soft" dot={status === 'Review'}>
          {status}
        </BktBadge>
        {sourceBoard ? (
          <BktBadge tone="neutral" appearance="outline">
            {sourceBoard}
          </BktBadge>
        ) : source === 'corpus' ? (
          <BktBadge tone="neutral" appearance="outline">
            Job Board
          </BktBadge>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: isMobile ? 'wrap' : undefined }}>
        <span
          style={{
            color: 'var(--text-body)',
            fontSize: 'var(--text-base)',
            overflow: isMobile ? undefined : 'hidden',
            textOverflow: isMobile ? undefined : 'ellipsis',
            whiteSpace: isMobile ? 'normal' : 'nowrap',
          }}
        >
          {title}
        </span>
        {score != null && <MatchScore score={score} />}
        {(jobType || remoteType) && (
          <span style={{ flexShrink: 0, font: '500 var(--text-xs)/1 var(--font-body)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {[jobType, remoteType].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {comp != null && (
        <span className="bkt-num" style={{ color: 'var(--text-body)', fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {comp}
        </span>
      )}

      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>{updatedAt}</span>

      <div style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 10 : 8 }}>
        {status === 'Applied' ? (
          <BktButton
            variant="outline"
            size="sm"
            className={isMobile ? 'bkt-touch' : undefined}
            style={{ borderRadius: 'var(--radius-pill)', ...(isMobile ? { flex: 1 } : {}) }}
            iconLeft={<Icon name="external-link" size={14} />}
            disabled={!onViewApplication}
            onClick={(e) => {
              e.stopPropagation()
              onViewApplication?.()
            }}
          >
            View Application
          </BktButton>
        ) : (
          <>
            <BktButton
              variant="secondary"
              size="sm"
              className={isMobile ? 'bkt-touch' : undefined}
              style={{
                color: 'var(--bkt-danger-ink)',
                background: 'var(--bkt-danger-soft)',
                borderColor: 'transparent',
                borderRadius: 'var(--radius-pill)',
                ...(isMobile ? { flex: 1 } : {}),
              }}
              onClick={(e) => {
                e.stopPropagation()
                onDecline?.()
              }}
            >
              Decline
            </BktButton>
            <BktButton
              variant="success"
              size="sm"
              className={isMobile ? 'bkt-touch' : undefined}
              style={{ borderRadius: 'var(--radius-pill)', ...(isMobile ? { flex: 1 } : {}) }}
              onClick={(e) => {
                e.stopPropagation()
                onApply?.()
              }}
            >
              {applyLabel}
            </BktButton>
          </>
        )}
      </div>
    </div>
  )
}
