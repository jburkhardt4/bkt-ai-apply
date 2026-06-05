import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import type { PipelineStage } from '../../../types/pipeline'
import { canTransitionStage } from '../domain/stageRules'
import {
  type ApplicationRow,
  fetchApplications,
  transitionStage,
} from '../services/applicationService'

const PIPELINE_STAGES: PipelineStage[] = [
  'discovery',
  'applied',
  'screening',
  'interview_scheduled',
  'interview_complete',
  'offer',
  'hired',
  'rejected',
  'ghosted',
]

const STAGE_LABELS: Record<PipelineStage, string> = {
  discovery: 'Discovery',
  applied: 'Applied',
  screening: 'Screening',
  interview_scheduled: 'Interview Sched.',
  interview_complete: 'Interview Done',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
}

function daysInStage(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
}

function scoreBadgeColor(score: number): string {
  // BR-008: auto-apply threshold is 80 (see masterProfile.constraints.autoApplyThreshold)
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#ca8a04'
  return '#dc2626'
}

interface PipelineBoardProps {
  selectedApplicationId: string | null
  onSelectApplication: (applicationId: string) => void
}

export function PipelineBoard({ selectedApplicationId, onSelectApplication }: PipelineBoardProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [refreshKey, setRefreshKey] = useState(0)
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<{
    applicationId: string
    fromStage: PipelineStage
  } | null>(null)
  const [toStage, setToStage] = useState<PipelineStage | ''>('')
  const [reason, setReason] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    void fetchApplications(userId)
      .then((apps) => {
        if (!cancelled) {
          setApplications(apps)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load applications')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  function openMoveForm(applicationId: string, fromStage: PipelineStage) {
    setMoveTarget({ applicationId, fromStage })
    setToStage('')
    setReason('')
  }

  async function handleMoveStage() {
    if (!moveTarget || !toStage || !reason.trim()) return
    setMoving(true)
    try {
      await transitionStage({
        applicationId: moveTarget.applicationId,
        userId,
        fromStage: moveTarget.fromStage,
        toStage,
        reason: reason.trim(),
      })
      setMoveTarget(null)
      setToStage('')
      setReason('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stage move failed')
    } finally {
      setMoving(false)
    }
  }

  const stageMap = new Map<PipelineStage, ApplicationRow[]>()
  for (const stage of PIPELINE_STAGES) {
    stageMap.set(stage, [])
  }
  for (const app of applications) {
    const bucket = stageMap.get(app.stage as PipelineStage)
    if (bucket) bucket.push(app)
  }

  if (loading && applications.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--ink-subtle)' }}>Loading pipeline…</div>
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.25rem', color: 'var(--ink-strong)' }}>
          Pipeline Board
        </h2>
        {loading && <span style={{ fontSize: '0.75rem', color: 'var(--ink-subtle)' }}>Refreshing…</span>}
      </div>

      {error && (
        <div
          style={{
            color: '#dc2626',
            marginBottom: '1rem',
            padding: '0.6rem 0.75rem',
            background: '#fef2f2',
            borderRadius: '8px',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
        {PIPELINE_STAGES.map((stage) => {
          const cards = stageMap.get(stage) ?? []
          return (
            <div
              key={stage}
              style={{
                minWidth: '210px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--ink-subtle)',
                  padding: '0.25rem 0',
                }}
              >
                {STAGE_LABELS[stage]}
                <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>({cards.length})</span>
              </div>

              {cards.map((app) => {
                const title = app.jobs?.title ?? app.job_id
                const company = app.jobs?.companies?.name ?? (app.jobs?.company_id ? `ID: ${app.jobs.company_id.slice(0, 6)}…` : '—')
                const days = daysInStage(app.updated_at)
                const isMoveOpen = moveTarget?.applicationId === app.id
                const isSelected = selectedApplicationId === app.id
                const validNextStages = PIPELINE_STAGES.filter((s) =>
                  canTransitionStage(app.stage as PipelineStage, s),
                )

                return (
                  <div
                    key={app.id}
                    onClick={() => onSelectApplication(app.id)}
                    style={{
                      border: `1px solid ${isSelected ? '#3b82f6' : 'var(--line)'}`,
                      borderRadius: '12px',
                      padding: '0.7rem',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      boxShadow: isSelected
                        ? '0 0 0 2px #93c5fd'
                        : '0 2px 4px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--ink-strong)',
                          }}
                        >
                          {title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ink-subtle)', marginTop: '0.1rem' }}>
                          {company}
                        </div>
                      </div>
                      {app.match_score !== null && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.35rem',
                            borderRadius: '999px',
                            background: scoreBadgeColor(app.match_score),
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {app.match_score}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.68rem', color: 'var(--ink-subtle)', marginTop: '0.35rem' }}>
                      {days === 0 ? 'Today' : `${days}d in stage`}
                    </div>

                    {validNextStages.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isMoveOpen) {
                            setMoveTarget(null)
                          } else {
                            openMoveForm(app.id, app.stage as PipelineStage)
                          }
                        }}
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.72rem',
                          padding: '0.25rem 0.5rem',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          background: 'white',
                          cursor: 'pointer',
                          width: '100%',
                          color: 'var(--ink)',
                        }}
                      >
                        {isMoveOpen ? 'Cancel' : 'Move Stage'}
                      </button>
                    )}

                    {isMoveOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: '0.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                        }}
                      >
                        <select
                          value={toStage}
                          onChange={(e) => setToStage(e.target.value as PipelineStage | '')}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.25rem',
                            border: '1px solid var(--line)',
                            borderRadius: '6px',
                            width: '100%',
                            background: 'white',
                          }}
                        >
                          <option value="">Select stage…</option>
                          {validNextStages.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABELS[s]}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          placeholder="Reason (required)"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.25rem',
                            border: '1px solid var(--line)',
                            borderRadius: '6px',
                            width: '100%',
                            font: 'inherit',
                          }}
                        />

                        <button
                          onClick={() => void handleMoveStage()}
                          disabled={!toStage || !reason.trim() || moving}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.3rem 0.5rem',
                            border: 'none',
                            borderRadius: '6px',
                            background: '#2563eb',
                            color: 'white',
                            cursor: !toStage || !reason.trim() || moving ? 'not-allowed' : 'pointer',
                            opacity: !toStage || !reason.trim() || moving ? 0.6 : 1,
                            width: '100%',
                          }}
                        >
                          {moving ? 'Moving…' : 'Confirm Move'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {cards.length === 0 && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--ink-subtle)',
                    textAlign: 'center',
                    padding: '1rem 0.5rem',
                    border: '1px dashed var(--line)',
                    borderRadius: '12px',
                  }}
                >
                  Empty
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
