// BKT AI-Apply — JD detail sidebar (Overview / Application / Job Fit tabs).
// Ported 1:1 from the design-system UI kit (JDSidebar.jsx).
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktAvatar } from '@/components/bkt/BktAvatar'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { ChipPill, QualLine, SkillTag } from '@/components/bkt/bits'
import { companyLogo } from '@/components/bkt/format'
import type { TimelineEvent } from '../services/autoApplyService'
import type { JobMatch, SearchJob } from '../types'

function JDTab({ label, badge, active, onClick }: { label: string; badge?: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 38,
        padding: '0 16px',
        background: active ? 'var(--surface)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-strong)' : 'transparent'}`,
        borderRadius: 'var(--radius-pill)',
        font: '600 var(--text-base)/1 var(--font-body)',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
        boxShadow: active ? 'var(--shadow-xs)' : 'none',
        cursor: 'pointer',
        transition: 'all var(--dur-fast) var(--ease-standard)',
      }}
    >
      {label}
      {badge != null && (
        <span
          style={{
            font: '700 var(--text-xs)/1 var(--font-mono)',
            color: 'var(--bkt-success-ink)',
            background: 'var(--bkt-success-soft)',
            padding: '3px 7px',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export type JDJob = JobMatch | SearchJob

export interface JDSidebarProps {
  job: JDJob | null
  onClose: () => void
  onApply: (id: JDJob['id']) => void
  onDecline: (id: JDJob['id']) => void
  /** Event-sourced application timeline shown on the Application tab. */
  auditEvents?: TimelineEvent[]
  auditLoading?: boolean
}

export function JDSidebar({ job, onClose, onApply, onDecline, auditEvents, auditLoading }: JDSidebarProps) {
  const [tab, setTab] = useState<'overview' | 'application' | 'fit'>('overview')
  // Reset to Overview when a different job opens (adjust-state-during-render).
  const jobId = job?.id
  const [prevJobId, setPrevJobId] = useState(jobId)
  if (jobId !== prevJobId) {
    setPrevJobId(jobId)
    setTab('overview')
  }
  if (!job) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0, 24, 72, 0.18)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}></div>
      <section
        style={{
          position: 'relative',
          width: 'min(560px, 92vw)',
          height: '100%',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'bkt-jd-slide-in var(--dur-medium) var(--ease-out) both',
        }}
      >
        {/* header */}
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              gap: 13,
              alignItems: 'flex-start',
              background: 'var(--bkt-slate-50)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              padding: '12px 13px',
            }}
          >
            <BktAvatar name={job.company ?? ''} src={companyLogo(job.domain)} size={52} square />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: '700 var(--text-sm)/1.2 var(--font-display)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text-strong)' }}>
                {job.company}
              </span>
              <span style={{ font: '600 var(--text-lg)/1.25 var(--font-display)', color: 'var(--text-body)' }}>
                {job.title}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <BktButton variant="ghost" size="icon" aria-label="Flag">
                <Icon name="flag" size={16} />
              </BktButton>
              <BktButton variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
                <Icon name="x" size={17} />
              </BktButton>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center' }}>
            {job.level && (
              <ChipPill icon="align-left" style={{ height: 30 }}>
                {job.level}
              </ChipPill>
            )}
            {job.location && (
              <ChipPill icon="map-pin" style={{ height: 30 }}>
                {job.location}
              </ChipPill>
            )}
            {job.comp && (
              <ChipPill icon="badge-dollar-sign" style={{ height: 30 }}>
                {job.comp}
              </ChipPill>
            )}
            {job.updated && (
              <ChipPill icon="clock-3" style={{ height: 30 }}>
                {job.updated}
              </ChipPill>
            )}
            <BktBadge tone="brand" appearance="soft">
              Review Matches
            </BktBadge>
          </div>
          <div style={{ display: 'flex', gap: 8, background: 'var(--bkt-slate-100)', borderRadius: 'var(--radius-pill)', padding: 4, alignSelf: 'flex-start' }}>
            <JDTab label="Overview" active={tab === 'overview'} onClick={() => setTab('overview')} />
            <JDTab label="Application" active={tab === 'application'} onClick={() => setTab('application')} />
            <JDTab label="Job Fit" badge={job.score} active={tab === 'fit'} onClick={() => setTab('fit')} />
          </div>
        </div>

        {/* body */}
        <div className="bkt-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {tab === 'overview' && (
            <>
              <p style={{ margin: 0, font: '400 var(--text-base)/1.65 var(--font-body)', color: 'var(--text-body)' }}>{job.overview}</p>
              <div>
                <div style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)', marginBottom: 10 }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(job.skills ?? []).map((s) => (
                    <SkillTag key={s}>{s}</SkillTag>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)', marginBottom: 10 }}>
                  Preferred Qualifications
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(job.preferred ?? []).map((s) => (
                    <SkillTag key={s}>{s}</SkillTag>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'application' &&
            (auditLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', font: '400 var(--text-sm)/1.5 var(--font-body)', padding: '26px 0' }}>
                Loading application activity…
              </div>
            ) : auditEvents && auditEvents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)', marginBottom: 14 }}>Activity</div>
                {auditEvents.map((ev, i) => (
                  <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary)', marginTop: 5, flexShrink: 0 }}></span>
                      {i < auditEvents.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--border)', margin: '3px 0' }}></span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 16 }}>
                      <span style={{ font: '600 var(--text-base)/1.2 var(--font-body)', color: 'var(--text-strong)' }}>{ev.title}</span>
                      <span style={{ font: '400 var(--text-xs)/1.3 var(--font-body)', color: 'var(--text-muted)' }}>
                        {ev.actor} · {ev.at}
                      </span>
                      {ev.reason && <span style={{ font: '400 var(--text-sm)/1.4 var(--font-body)', color: 'var(--text-body)' }}>{ev.reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '26px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  font: '400 var(--text-sm)/1.5 var(--font-body)',
                }}
              >
                Application materials will appear here once Auto Apply submits this role.
              </div>
            ))}

          {tab === 'fit' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ font: '700 var(--text-2xl)/1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', color: 'var(--text-strong)' }}>
                  {job.score}/100
                </span>
                <span style={{ width: 1, height: 24, background: 'var(--border-strong)' }}></span>
                <span
                  style={{
                    font: '700 var(--text-lg)/1 var(--font-body)',
                    color: job.score >= 80 ? 'var(--bkt-score-high)' : job.score >= 65 ? 'var(--bkt-score-good)' : 'var(--bkt-score-mid)',
                  }}
                >
                  {job.score >= 80 ? 'Perfect fit' : job.score >= 65 ? 'Strong fit' : 'Possible fit'}
                </span>
              </div>
              <div
                style={{
                  background: 'var(--bkt-slate-50)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="sparkles" size={16} color="var(--primary)" />
                  <span style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)' }}>Why this might be a good fit</span>
                </div>
                <p style={{ margin: 0, font: '400 var(--text-base)/1.6 var(--font-body)', color: 'var(--text-body)' }}>{job.why}</p>
              </div>
              <div>
                <div style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)', marginBottom: 8 }}>Key Matches</div>
                {(job.keyMatches ?? []).map((m) => (
                  <QualLine key={m} ok>
                    {m}
                  </QualLine>
                ))}
              </div>
              <div>
                <div style={{ font: '700 var(--text-md)/1 var(--font-display)', color: 'var(--text-strong)', marginBottom: 8 }}>Key Gaps</div>
                {(job.keyGaps ?? []).map((g) => (
                  <QualLine key={g} ok={false}>
                    {g}
                  </QualLine>
                ))}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 26px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <BktButton variant="outline" size="md" style={{ borderRadius: 'var(--radius-pill)' }} iconRight={<Icon name="external-link" size={15} />}>
            View Job
          </BktButton>
          <div style={{ flex: 1 }}></div>
          <BktButton
            variant="danger"
            size="md"
            style={{ borderRadius: 'var(--radius-pill)', minWidth: 110 }}
            onClick={() => {
              onDecline(job.id)
              onClose()
            }}
          >
            Decline
          </BktButton>
          <BktButton
            variant="primary"
            size="md"
            style={{ borderRadius: 'var(--radius-pill)', minWidth: 124, color: 'var(--bkt-zinc-50)', boxShadow: 'var(--shadow-brand)' }}
            onClick={() => {
              onApply(job.id)
              onClose()
            }}
          >
            Apply
          </BktButton>
        </div>
      </section>
    </div>
  )
}
