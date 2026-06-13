// BKT AI-Apply — compose/reply/forward modal for the Inbox (BR-038).
// Sending is always an explicit click; "Draft with AI" only fills the body
// for review. Content mounts fresh per open (BudgetModal pattern), so all
// draft state initializes from the target email without reset effects.
import { useState } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import { BktInput } from '@/components/bkt/BktInput'
import type { ToastFn } from '@/components/bkt/toast'
import { draftReply, sendEmail } from '../services/emailSendService'
import type { EmailMessage } from '../types'

export interface ComposeTarget {
  mode: 'reply' | 'forward'
  email: EmailMessage
}

export function ComposeModal({
  target,
  onClose,
  onToast,
}: {
  target: ComposeTarget | null
  onClose: () => void
  onToast: ToastFn
}) {
  if (!target) return null
  return <ComposeModalContent target={target} onClose={onClose} onToast={onToast} />
}

function prefixedSubject(prefix: 'Re' | 'Fwd', subject: string): string {
  const base = subject.trim()
  if (new RegExp(`^${prefix === 'Re' ? 're' : 'fwd?'}:`, 'i').test(base)) return base
  return `${prefix}: ${base}`
}

function ComposeModalContent({
  target,
  onClose,
  onToast,
}: {
  target: ComposeTarget
  onClose: () => void
  onToast: ToastFn
}) {
  const { mode, email } = target
  const [to, setTo] = useState(mode === 'reply' ? email.from : '')
  const [subject, setSubject] = useState(prefixedSubject(mode === 'reply' ? 'Re' : 'Fwd', email.subject))
  const [body, setBody] = useState(
    mode === 'forward'
      ? `\n\n---------- Forwarded message ----------\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body.join('\n\n')}`
      : '',
  )
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (sending) return
    if (!to.trim()) return setError('Recipient is required.')
    if (!body.trim()) return setError('Message body is required.')
    setError(null)
    setSending(true)
    sendEmail({ mode, emailId: String(email.id), to: to.trim(), subject: subject.trim(), body }).then(
      () => {
        setSending(false)
        onToast(`Sent — ${to.trim()}`, 'send', 'var(--bkt-success)')
        onClose()
      },
      (err: unknown) => {
        setSending(false)
        setError(err instanceof Error ? err.message : 'Send failed')
      },
    )
  }

  const runDraft = () => {
    if (drafting) return
    setError(null)
    setDrafting(true)
    draftReply(String(email.id)).then(
      (draft) => {
        setDrafting(false)
        setBody(draft)
        onToast('Draft ready — review before sending', 'wand-sparkles', 'var(--bkt-blue-300)')
      },
      (err: unknown) => {
        setDrafting(false)
        setError(err instanceof Error ? err.message : 'Draft failed')
      },
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,16,19,0.32)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}></div>
      <div
        className="bkt-enter"
        style={{
          position: 'relative',
          width: 'min(620px, 94vw)',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ font: '600 var(--text-lg)/1.2 var(--font-display)', margin: 0 }}>
            {mode === 'reply' ? 'Reply' : 'Forward'}
          </h3>
          <BktButton variant="ghost" size="icon" aria-label="Close compose" onClick={onClose}>
            <Icon name="x" size={16} />
          </BktButton>
        </div>

        <BktInput label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
        <BktInput label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: '600 var(--text-xs)/1 var(--font-body)', color: 'var(--text-muted)' }}>Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder={drafting ? 'Drafting…' : 'Write your message'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 160,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
              font: '400 var(--text-sm)/1.55 var(--font-body)',
              color: 'var(--text-strong)',
              outline: 'none',
            }}
          />
        </label>

        {error && (
          <span style={{ font: '500 var(--text-xs)/1.4 var(--font-body)', color: 'var(--bkt-danger)' }}>{error}</span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mode === 'reply' && (
            <BktButton
              variant="outline"
              size="md"
              loading={drafting}
              iconLeft={!drafting ? <Icon name="wand-sparkles" size={15} color="var(--primary)" /> : null}
              onClick={runDraft}
            >
              {drafting ? 'Drafting…' : 'Draft with AI'}
            </BktButton>
          )}
          <div style={{ flex: 1 }}></div>
          <BktButton variant="secondary" onClick={onClose}>
            Cancel
          </BktButton>
          <BktButton
            variant="primary"
            loading={sending}
            iconLeft={!sending ? <Icon name="send" size={15} /> : null}
            onClick={submit}
          >
            {sending ? 'Sending…' : 'Send'}
          </BktButton>
        </div>
      </div>
    </div>
  )
}
