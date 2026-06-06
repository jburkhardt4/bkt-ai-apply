import { useMemo, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import { masterProfile } from '../data/masterProfile'
import {
  approvePreparedPacket,
  prepareSubmissionPacket,
  type PreparedSubmissionPacket,
  type PrepareSubmissionPacketResult,
} from '../services/submissionApprovalService'

interface SubmissionGatePanelProps {
  applicationId: string
  onApproved: () => void
}

function eligibilityLabel(packet: PreparedSubmissionPacket): string {
  if (packet.autoSubmitEligible) {
    return `Eligible for auto-submit prep path (score >= ${packet.threshold})`
  }

  if (packet.matchScore === null) {
    return 'Score unavailable. Manual prep is allowed, but auto-submit prep eligibility is unknown.'
  }

  return `Manual prep only: score ${packet.matchScore} is below ${packet.threshold}.`
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
    if (!prepareResult || prepareResult.status !== 'ready') {
      return null
    }

    return prepareResult.packet
  }, [prepareResult])

  async function handlePreparePacket() {
    if (!userId) {
      return
    }

    setPreparing(true)
    setError(null)
    setStatusMessage(null)
    setConfirmApproval(false)

    try {
      const result = await prepareSubmissionPacket({
        userId,
        applicationId,
      })

      setPrepareResult(result)

      if (result.status === 'queued') {
        setStatusMessage(result.reason)
      } else {
        setStatusMessage('Packet prepared. Review content and explicitly approve to continue.')
      }
    } catch (err) {
      setPrepareResult(null)
      setError(err instanceof Error ? err.message : 'Failed to prepare submission packet')
    } finally {
      setPreparing(false)
    }
  }

  async function handleApprovePacket() {
    if (!preparedPacket || !confirmApproval) {
      return
    }

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

      setStatusMessage('Approval recorded. No autonomous external submission was executed in MVP.')
      onApproved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve submission packet')
    } finally {
      setApproving(false)
    }
  }

  return (
    <section
      style={{
        marginTop: '1.5rem',
        border: '1px solid var(--line)',
        borderRadius: '16px',
        background: 'var(--surface)',
        padding: '1rem',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          margin: '0 0 0.5rem',
          fontSize: '1rem',
          color: 'var(--ink-strong)',
        }}
      >
        UITL Submission Gate
      </h3>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--ink-subtle)' }}>
        BR-040 and BR-041: packet review and explicit approval are required in MVP. No autonomous submission is performed.
      </p>

      <button
        onClick={() => void handlePreparePacket()}
        disabled={preparing || approving || !userId}
        style={{
          fontSize: '0.78rem',
          padding: '0.35rem 0.65rem',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          background: 'white',
          cursor: preparing || approving || !userId ? 'not-allowed' : 'pointer',
          color: 'var(--ink)',
          marginBottom: '0.8rem',
        }}
      >
        {preparing ? 'Preparing packet…' : 'Prepare Packet'}
      </button>

      {statusMessage && (
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--ink-subtle)',
            marginBottom: '0.75rem',
          }}
        >
          {statusMessage}
        </div>
      )}

      {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</div>}

      {preparedPacket && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.55rem 0.65rem',
              borderRadius: '10px',
              background: preparedPacket.autoSubmitEligible ? '#ecfdf3' : '#fffbeb',
              color: preparedPacket.autoSubmitEligible ? '#166534' : '#92400e',
              fontSize: '0.78rem',
              border: preparedPacket.autoSubmitEligible ? '1px solid #bbf7d0' : '1px solid #fde68a',
            }}
          >
            {eligibilityLabel(preparedPacket)}
          </div>

          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '0.65rem',
              background: 'white',
            }}
          >
            <strong style={{ fontSize: '0.8rem', color: 'var(--ink-strong)' }}>
              Resume preview (v{preparedPacket.resume.version})
            </strong>
            <pre
              style={{
                margin: '0.45rem 0 0',
                fontSize: '0.72rem',
                whiteSpace: 'pre-wrap',
                color: 'var(--ink)',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {preparedPacket.resume.content}
            </pre>
          </div>

          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '0.65rem',
              background: 'white',
            }}
          >
            <strong style={{ fontSize: '0.8rem', color: 'var(--ink-strong)' }}>
              Cover letter preview (v{preparedPacket.coverLetter.version})
            </strong>
            <pre
              style={{
                margin: '0.45rem 0 0',
                fontSize: '0.72rem',
                whiteSpace: 'pre-wrap',
                color: 'var(--ink)',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {preparedPacket.coverLetter.content}
            </pre>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={confirmApproval}
              onChange={(event) => setConfirmApproval(event.target.checked)}
            />
            I explicitly approve this packet for submission flow processing (manual gate).
          </label>

          <button
            onClick={() => void handleApprovePacket()}
            disabled={!confirmApproval || approving || !userId}
            style={{
              fontSize: '0.8rem',
              padding: '0.42rem 0.7rem',
              border: 'none',
              borderRadius: '8px',
              background: '#1d4ed8',
              color: 'white',
              cursor: !confirmApproval || approving || !userId ? 'not-allowed' : 'pointer',
              opacity: !confirmApproval || approving || !userId ? 0.65 : 1,
              width: 'fit-content',
            }}
          >
            {approving ? 'Recording approval…' : 'Approve Packet'}
          </button>
        </div>
      )}

      <p style={{ margin: '0.8rem 0 0', fontSize: '0.72rem', color: 'var(--ink-subtle)' }}>
        Eligibility threshold source: masterProfile.constraints.autoApplyThreshold = {masterProfile.constraints.autoApplyThreshold}.
      </p>
    </section>
  )
}