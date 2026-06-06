import { useEffect, useState } from 'react'
import { ArrowRight, MoveRight } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import type { PipelineStage } from '../../../types/pipeline'
import { canTransitionStage } from '../domain/stageRules'
import {
  type ApplicationRow,
  fetchApplications,
  transitionStage,
} from '../services/applicationService'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const PIPELINE_STAGES: PipelineStage[] = [
  'discovery', 'applied', 'screening', 'interview_scheduled', 'interview_complete',
  'offer', 'hired', 'rejected', 'ghosted',
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

const STAGE_COLORS: Partial<Record<PipelineStage, string>> = {
  hired: 'text-green-700',
  offer: 'text-blue-700',
  rejected: 'text-red-600',
  ghosted: 'text-muted-foreground',
}

function daysInStage(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
}

function scoreVariant(score: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score >= 80) return 'default'
  if (score >= 60) return 'secondary'
  return 'destructive'
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-600 text-white hover:bg-green-600'
  if (score >= 60) return 'bg-yellow-500 text-white hover:bg-yellow-500'
  return 'bg-red-600 text-white hover:bg-red-600'
}

interface PipelineBoardProps {
  selectedApplicationId: string | null
  onSelectApplication: (applicationId: string) => void
}

export function PipelineBoard({ selectedApplicationId, onSelectApplication }: PipelineBoardProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ applicationId: string; fromStage: PipelineStage } | null>(null)
  const [toStage, setToStage] = useState<PipelineStage | ''>('')
  const [reason, setReason] = useState('')
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchApplications(userId)
      .then((apps) => { if (!cancelled) { setApplications(apps); setError(null); setLoading(false) } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load applications'); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, localRefreshKey])

  function openMoveDialog(applicationId: string, fromStage: PipelineStage) {
    setMoveTarget({ applicationId, fromStage })
    setToStage('')
    setReason('')
  }

  async function handleMoveStage() {
    if (!moveTarget || !toStage || !reason.trim()) return
    setMoving(true)
    try {
      await transitionStage({ applicationId: moveTarget.applicationId, userId, fromStage: moveTarget.fromStage, toStage, reason: reason.trim() })
      setMoveTarget(null)
      setLocalRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stage move failed')
    } finally {
      setMoving(false)
    }
  }

  const stageMap = new Map<PipelineStage, ApplicationRow[]>()
  for (const stage of PIPELINE_STAGES) stageMap.set(stage, [])
  for (const app of applications) {
    const bucket = stageMap.get(app.stage as PipelineStage)
    if (bucket) bucket.push(app)
  }

  const movingApp = applications.find((a) => a.id === moveTarget?.applicationId)
  const validNextStages = moveTarget
    ? PIPELINE_STAGES.filter((s) => canTransitionStage(moveTarget.fromStage, s))
    : []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2
          className="text-lg font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Pipeline Board
        </h2>
        {loading && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const cards = stageMap.get(stage) ?? []
          return (
            <div key={stage} className="flex w-52 shrink-0 flex-col gap-2">
              {/* Column header */}
              <div className="flex items-center justify-between px-1">
                <span className={cn('text-xs font-semibold uppercase tracking-wide', STAGE_COLORS[stage] ?? 'text-muted-foreground')}>
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              {cards.map((app) => {
                const title = app.jobs?.title ?? app.job_id
                const company = app.jobs?.companies?.name ?? (app.jobs?.company_id ? `ID: ${app.jobs.company_id.slice(0, 6)}…` : '—')
                const days = daysInStage(app.updated_at)
                const isSelected = selectedApplicationId === app.id
                const hasNextStages = PIPELINE_STAGES.filter((s) => canTransitionStage(app.stage as PipelineStage, s)).length > 0

                return (
                  <Card
                    key={app.id}
                    onClick={() => onSelectApplication(app.id)}
                    className={cn(
                      'cursor-pointer transition-all duration-150 hover:shadow-md',
                      isSelected && 'ring-2 ring-primary shadow-md',
                    )}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{title}</p>
                          <p className="text-[0.65rem] text-muted-foreground">{company}</p>
                        </div>
                        {app.match_score !== null && (
                          <Badge className={cn('shrink-0 text-[0.65rem] px-1.5 py-0.5', scoreBadgeClass(app.match_score))} variant={scoreVariant(app.match_score)}>
                            {app.match_score}
                          </Badge>
                        )}
                      </div>

                      <p className="text-[0.65rem] text-muted-foreground">
                        {days === 0 ? 'Today' : `${days}d in stage`}
                      </p>

                      {hasNextStages && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openMoveDialog(app.id, app.stage as PipelineStage) }}
                          className="h-6 w-full gap-1 text-[0.65rem]"
                        >
                          <MoveRight className="h-3 w-3" />
                          Move Stage
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {cards.length === 0 && (
                <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                  Empty
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Move stage dialog */}
      <Dialog open={!!moveTarget} onOpenChange={(open) => { if (!open) setMoveTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-display)' }}>Move Stage</DialogTitle>
          </DialogHeader>
          {movingApp && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{movingApp.jobs?.title ?? movingApp.job_id}</p>
              <p className="mt-0.5 flex items-center gap-1">
                <span>{STAGE_LABELS[moveTarget!.fromStage]}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-primary">{toStage ? STAGE_LABELS[toStage] : '…'}</span>
              </p>
            </div>
          )}
          <div className="space-y-3">
            <Select value={toStage} onValueChange={(v) => setToStage(v as PipelineStage)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select target stage…" />
              </SelectTrigger>
              <SelectContent>
                {validNextStages.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button
              onClick={() => void handleMoveStage()}
              disabled={!toStage || !reason.trim() || moving}
            >
              {moving ? 'Moving…' : 'Confirm Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
