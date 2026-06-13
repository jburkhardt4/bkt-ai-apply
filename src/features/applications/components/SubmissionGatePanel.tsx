import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, FileText, Loader2, Shield, X } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { useReviewMode } from '../../auto-apply/state'
import { masterProfile } from '../data/masterProfile'
import {
  approvePreparedPacket,
  prepareSubmissionPacket,
  type PreparedSubmissionPacket,
  type PrepareSubmissionPacketResult,
} from '../services/submissionApprovalService'
import {
  cancelQueued,
  decideQueueAction,
  enqueueForSubmission,
  fetchQueueEntry,
  fetchSubmitThreshold,
  type QueueEntry,
} from '../services/submissionQueueService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SubmissionGatePanelProps {
  applicationId: string
  onApproved: () => void
}

function eligibilityLabel(packet: PreparedSubmissionPacket): string {
  if (packet.autoSubmitEligible) return `Eligible for auto-submit (score ≥ ${packet.threshold})`
  if (packet.matchScore === null) return 'Score unavailable — manual prep allowed, eligibility unknown.'
  return `Manual prep only: score ${packet.matchScore} is below threshold ${packet.threshold}.`
}

/** Human-readable status line for the live queue row (honest: "queued", not "submitted"). */
function queueStatusLabel(entry: QueueEntry): string {
  switch (entry.status) {
    case 'pending_approval':
      return 'Queued — awaiting approval before the submission worker picks it up.'
    case 'approved':
      return 'Queued for submission — the submission worker will submit it.'
    case 'submitting':
      return 'Submitting — the worker is sending this application now.'
    case 'submitted':
      return 'Submitted by the worker.'
    case 'failed':
      return 'Submission failed — see the reason below.'
    case 'cancelled':
      return 'Cancelled — this application will not be submitted.'
    default:
      return `Queue status: ${entry.status}.`
  }
}

/** Color language mirrors the eligibility banner: green = done/eligible, red = failed, amber = in-flight/waiting. */
function queueStatusTone(status: string): string {
  if (status === 'submitted') return 'bg-green-50 border-green-200 text-green-800'
  if (status === 'failed') return 'bg-red-50 border-red-200 text-red-800'
  if (status === 'cancelled') return 'bg-muted/40 border-border text-muted-foreground'
  return 'bg-blue-50 border-blue-200 text-blue-800'
}

const CANCELLABLE = new Set(['pending_approval', 'approved'])

export function SubmissionGatePanel({ applicationId, onApproved }: SubmissionGatePanelProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [reviewMode] = useReviewMode()
  const [prepareResult, setPrepareResult] = useState<PrepareSubmissionPacketResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [approving, setApproving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmApproval, setConfirmApproval] = useState(false)
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null)
  // Render-phase reset key: when the selected application changes, drop all
  // transient gate state in render rather than in an effect (the React-
  // recommended pattern — avoids cascading-render setState-in-effect).
  const [seenApplicationId, setSeenApplicationId] = useState(applicationId)

  if (seenApplicationId !== applicationId) {
    setSeenApplicationId(applicationId)
    setPrepareResult(null)
    setError(null)
    setStatusMessage(null)
    setConfirmApproval(false)
    setQueueEntry(null)
  }

  const preparedPacket = useMemo(() => {
    if (!prepareResult || prepareResult.status !== 'ready') return null
    return prepareResult.packet
  }, [prepareResult])

  // Imperative re-read used by the write-path callbacks (approve / cancel) — a
  // queue read failure must not blank the gate, so it swallows read errors;
  // errors that matter are raised on the write paths themselves.
  async function refreshQueue() {
    if (!userId) return
    try {
      setQueueEntry(await fetchQueueEntry(userId, applicationId))
    } catch {
      // intentional: see above.
    }
  }

  // Load any existing queue row for the current application (and re-load when it
  // changes). The transient reset above runs in render; this effect only
  // synchronizes external (Supabase) state — setState happens in the async
  // continuation, never synchronously in the effect body.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchQueueEntry(userId, applicationId)
      .then((entry) => { if (!cancelled) setQueueEntry(entry) })
      .catch(() => { /* a queue read failure must not blank the gate */ })
    return () => { cancelled = true }
  }, [userId, applicationId])

  async function handlePreparePacket() {
    if (!userId) return
    setPreparing(true)
    setError(null)
    setStatusMessage(null)
    setConfirmApproval(false)
    try {
      const result = await prepareSubmissionPacket({ userId, applicationId })
      setPrepareResult(result)

      if (result.status === 'queued') {
        setStatusMessage(result.reason)
        return
      }

      // Autonomous path (assist/auto): when the packet clears the threshold and
      // the user's review mode permits it, auto-enqueue WITHOUT the human
      // checkbox. The worker re-validates every guardrail server-side (BR-131),
      // so enqueuing `approved` here is safe.
      const threshold = await fetchSubmitThreshold(userId)
      const decision = decideQueueAction({
        reviewMode,
        matchScore: result.packet.matchScore,
        threshold,
      })

      if (decision.shouldEnqueue) {
        const entry = await enqueueForSubmission({
          userId,
          applicationId: result.packet.applicationId,
          status: decision.status,
          queuedBy: decision.queuedBy,
        })
        setQueueEntry(entry)
        setStatusMessage(`Auto-queued (${reviewMode} mode). The submission worker will submit it.`)
        onApproved()
        return
      }

      setStatusMessage('Packet prepared. Review and approve to continue.')
    } catch (err) {
      setPrepareResult(null)
      setError(err instanceof Error ? err.message : 'Failed to prepare packet')
    } finally {
      setPreparing(false)
    }
  }

  async function handleApprovePacket() {
    if (!preparedPacket || !confirmApproval) return
    setApproving(true)
    setError(null)
    try {
      await approvePreparedPacket({
        userId,
        applicationId: preparedPacket.applicationId,
        matchScore: preparedPacket.matchScore,
        resumeDocumentId: preparedPacket.resume.documentId,
        coverLetterDocumentId: preparedPacket.coverLetter.documentId,
      })
      // Explicit human approval → enqueue as approved/user. Honest copy: this is
      // queued for the worker, NOT yet submitted.
      const entry = await enqueueForSubmission({
        userId,
        applicationId: preparedPacket.applicationId,
        status: 'approved',
        queuedBy: 'user',
      })
      setQueueEntry(entry)
      setStatusMessage('Queued for submission — the submission worker will submit it.')
      onApproved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve packet')
    } finally {
      setApproving(false)
    }
  }

  async function handleCancelQueued() {
    if (!userId) return
    setCancelling(true)
    setError(null)
    try {
      const entry = await cancelQueued({ userId, applicationId })
      if (entry) {
        setQueueEntry(entry)
        setStatusMessage('Cancelled — this application will not be submitted.')
      } else {
        // Nothing cancellable (already worker-owned or absent) — resync truth.
        await refreshQueue()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel queued submission')
    } finally {
      setCancelling(false)
    }
  }

  const canCancel = queueEntry !== null && CANCELLABLE.has(queueEntry.status)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
              Submission Gate
            </CardTitle>
            <CardDescription className="text-xs">
              ADR-006: autonomy follows your review mode. Approval queues the application; the
              submission worker submits it and re-checks every guardrail server-side.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handlePreparePacket()}
          disabled={preparing || approving || !userId}
          className="gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" />
          {preparing ? 'Preparing…' : 'Prepare Packet'}
        </Button>

        {statusMessage && (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Live queue status (honest: "queued"/"submitting", never "submitted" unless the worker said so). */}
        {queueEntry && (
          <div className={`space-y-2 rounded-md border px-3 py-2 text-sm ${queueStatusTone(queueEntry.status)}`}>
            <div className="flex items-start justify-between gap-2">
              <p>{queueStatusLabel(queueEntry)}</p>
              {canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCancelQueued()}
                  disabled={cancelling}
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                >
                  {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </Button>
              )}
            </div>
            {queueEntry.status === 'failed' && queueEntry.lastError && (
              <p className="text-xs opacity-90">Reason: {queueEntry.lastError}</p>
            )}
          </div>
        )}

        {preparedPacket && (
          <div className="space-y-3">
            {/* Eligibility banner */}
            <div className={`rounded-md border px-3 py-2 text-sm ${preparedPacket.autoSubmitEligible ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
              {eligibilityLabel(preparedPacket)}
            </div>

            {/* Document previews */}
            {[
              { label: `Resume (v${preparedPacket.resume.version})`, content: preparedPacket.resume.content },
              { label: `Cover letter (v${preparedPacket.coverLetter.version})`, content: preparedPacket.coverLetter.content },
            ].map(({ label, content }) => (
              <div key={label} className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
                <pre className="max-h-48 overflow-y-auto text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {content}
                </pre>
              </div>
            ))}

            {/* Explicit-approval path: required in review mode, and for below-threshold
                assist/auto packets that did not auto-queue. */}
            {!queueEntry && (
              <>
                <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 p-3">
                  <Checkbox
                    id="confirm-approval"
                    checked={confirmApproval}
                    onCheckedChange={(v) => setConfirmApproval(v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor="confirm-approval" className="cursor-pointer text-sm text-foreground">
                    I explicitly approve this packet — queue it for the submission worker.
                  </label>
                </div>

                <Button
                  onClick={() => void handleApprovePacket()}
                  disabled={!confirmApproval || approving || !userId}
                  className="gap-1.5"
                >
                  <CheckCircle className="h-4 w-4" />
                  {approving ? 'Queueing…' : 'Approve & Queue'}
                </Button>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Threshold: masterProfile.constraints.autoApplyThreshold = {masterProfile.constraints.autoApplyThreshold}
          {' '}· enforced server-side from user_settings.auto_submit_score_threshold (BR-131).
        </p>
      </CardContent>
    </Card>
  )
}
