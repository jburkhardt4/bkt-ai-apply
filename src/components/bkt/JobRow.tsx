// BKT AI-Apply — JobRow (ported from the BKT design system)
// One row of the "Your Jobs" table: company avatar + name + status,
// job posting + match score, comp, updated-at, Decline/Apply actions.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BktAvatar } from './BktAvatar'
import { BktBadge } from './BktBadge'
import type { BktBadgeTone } from './BktBadge'
import { BktButton } from './BktButton'
import { MatchScore } from './MatchScore'
import type { JobStatus } from '@/features/auto-apply/types'

export interface JobRowProps {
  company: string
  logoSrc?: string | null
  title: string
  comp?: string | null
  score?: number
  status?: JobStatus
  updatedAt?: string
  onApply?: () => void
  onDecline?: () => void
  onClick?: () => void
  selected?: boolean
  style?: CSSProperties
}

const STATUS_TONE: Record<JobStatus, BktBadgeTone> = {
  Review: 'brand',
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
  updatedAt = '2 hours ago',
  onApply,
  onDecline,
  onClick,
  selected = false,
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
        display: 'grid',
        gridTemplateColumns:
          comp != null
            ? 'minmax(200px, 1fr) minmax(230px, 1.4fr) 122px 110px 170px'
            : 'minmax(220px, 1.1fr) minmax(260px, 1.6fr) 110px 170px',
        alignItems: 'center',
        gap: 16,
        padding: '12px 18px',
        background: selected ? 'var(--accent)' : hover ? 'var(--bkt-slate-50)' : 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
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
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          style={{
            color: 'var(--text-body)',
            fontSize: 'var(--text-base)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {score != null && <MatchScore score={score} />}
      </div>

      {comp != null && (
        <span className="bkt-num" style={{ color: 'var(--text-body)', fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {comp}
        </span>
      )}

      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>{updatedAt}</span>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <BktButton
          variant="secondary"
          size="sm"
          style={{
            color: 'var(--bkt-danger-ink)',
            background: 'var(--bkt-danger-soft)',
            borderColor: 'transparent',
            borderRadius: 'var(--radius-pill)',
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
          style={{ borderRadius: 'var(--radius-pill)' }}
          onClick={(e) => {
            e.stopPropagation()
            onApply?.()
          }}
        >
          Apply
        </BktButton>
      </div>
    </div>
  )
}
