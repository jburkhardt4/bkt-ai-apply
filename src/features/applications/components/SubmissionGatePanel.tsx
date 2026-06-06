import { useMemo, useState } from 'react'
import { CheckCircle, FileText, Shield } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { masterProfile } from '../data/masterProfile'
import {
  approvePreparedPacket,
  prepareSubmissionPacket,
  type PreparedSubmissionPacket,
  type PrepareSubmissionPacketResult,
} from '../services/submissionApprovalService'
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

export function SubmissionGatePanel({ applicationId, onApproved }: SubmissionGatePanelProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [prepareResult, setPrepareResult] = useState<PrepareSubmissionPacketResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [approving, setApproving] = useState(false)
  const [confirmApproval, setConfirmApproval] = useState(false)

  const preparedPacket = useMemo(() => {
    if (!prepareResult || prepareResult.status !== 'ready') return null
    return prepareResult.packet
  }, [prepareResult])

  async function handlePreparePacket() {
    if (!userId) return
    setPreparing(true)
    setError(null)
    setStatusMessage(null)
    setConfirmApproval(false)
    try {
      const result = await prepareSubmissionPacket({ userId, applicationId })
      setPrepareResult(result)
      setStatusMessage(result.status === 'queued' ? result.reason : 'Packet prepared. Review and approve to continue.')
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
      setStatusMessage('Approval recorded. No autonomous external submission in MVP.')
      onApproved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve packet')
    } finally {
      setApproving(false)
    }
  }

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
              BR-040/041: packet review and explicit approval required. No autonomous submission in MVP.
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

            {/* Confirm + approve */}
            <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 p-3">
              <Checkbox
                id="confirm-approval"
                checked={confirmApproval}
                onCheckedChange={(v) => setConfirmApproval(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="confirm-approval" className="cursor-pointer text-sm text-foreground">
                I explicitly approve this packet for submission flow processing (manual gate).
              </label>
            </div>

            <Button
              onClick={() => void handleApprovePacket()}
              disabled={!confirmApproval || approving || !userId}
              className="gap-1.5"
            >
              <CheckCircle className="h-4 w-4" />
              {approving ? 'Recording approval…' : 'Approve Packet'}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Threshold: masterProfile.constraints.autoApplyThreshold = {masterProfile.constraints.autoApplyThreshold}
        </p>
      </CardContent>
    </Card>
  )
}
