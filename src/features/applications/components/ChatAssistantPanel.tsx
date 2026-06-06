import { useMemo, useState } from 'react'
import { useAuth } from '../../../contexts/auth-context'
import { runChatAssistant, type ChatAssistantResponse } from '../services/chatAssistantService'
import { buildChatAssistantMeta } from './chatAssistantPanelView'

interface ChatAssistantPanelProps {
  selectedApplicationId?: string | null
}

function getToneStyles(response: ChatAssistantResponse | null): { background: string; border: string; color: string } {
  if (response?.status === 'deferred') {
    return { background: '#fff1f2', border: '#fecdd3', color: '#9f1239' }
  }

  if (response?.costStatus === 'warn') {
    return { background: '#fff7ed', border: '#fed7aa', color: '#9a3412' }
  }

  if (response?.costStatus === 'capped') {
    return { background: '#fff1f2', border: '#fecdd3', color: '#9f1239' }
  }

  return { background: '#ecfdf3', border: '#bbf7d0', color: '#166534' }
}

export function ChatAssistantPanel({ selectedApplicationId = null }: ChatAssistantPanelProps) {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ChatAssistantResponse | null>(null)

  const metadata = useMemo(() => (response ? buildChatAssistantMeta(response) : []), [response])
  const tone = getToneStyles(response)
  const canSubmit = prompt.trim().length > 0 && !loading && !!user?.id

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const userId = user?.id
    const message = prompt.trim()
    if (!userId || message.length === 0) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const nextResponse = await runChatAssistant({
        userId,
        message,
        applicationId: selectedApplicationId ?? undefined,
      })

      setResponse(nextResponse)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get assistant response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        border: '1px solid var(--line)',
        borderRadius: '18px',
        padding: '1rem',
        background: 'var(--surface)',
        boxShadow: '0 12px 28px rgba(7, 16, 27, 0.06)',
      }}
    >
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: '1.05rem', color: 'var(--ink-strong)' }}>
          AI Chat Assistant
        </h2>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-subtle)', fontSize: '0.82rem' }}>
          Strategy support powered by deterministic local routing and context from your pipeline.
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} style={{ marginTop: '0.85rem', display: 'grid', gap: '0.6rem' }}>
        <label htmlFor="chat-assistant-prompt" style={{ fontSize: '0.78rem', color: 'var(--ink-subtle)', fontWeight: 600 }}>
          Ask about score rationale, follow-up drafts, or targeting strategy
        </label>
        <textarea
          id="chat-assistant-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: Suggest filters to increase interview rate for SaaS platform roles."
          rows={4}
          style={{
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '0.7rem 0.75rem',
            color: 'var(--ink)',
            background: '#fff',
            resize: 'vertical',
            font: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-subtle)', fontSize: '0.76rem' }}>
            {selectedApplicationId ? 'Scoped to selected application context.' : 'Using overall pipeline context.'}
          </span>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              fontSize: '0.78rem',
              padding: '0.42rem 0.78rem',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              background: canSubmit ? '#fff' : '#f6f8fb',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              color: 'var(--ink)',
              fontWeight: 600,
            }}
          >
            {loading ? 'Working…' : 'Run assistant'}
          </button>
        </div>
      </form>

      {error && <div style={{ color: '#dc2626', marginTop: '0.75rem', fontSize: '0.82rem' }}>{error}</div>}

      {response && (
        <div
          style={{
            marginTop: '0.9rem',
            borderRadius: '16px',
            border: `1px solid ${tone.border}`,
            background: tone.background,
            padding: '0.8rem',
            display: 'grid',
            gap: '0.6rem',
          }}
        >
          <div style={{ color: tone.color, fontWeight: 700, fontSize: '0.83rem' }}>
            {response.status === 'deferred' ? 'Deferred due to AI cap' : 'Assistant response'}
          </div>
          <div style={{ color: 'var(--ink)', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{response.answerText}</div>

          {response.status === 'deferred' && (
            <div style={{ color: tone.color, fontSize: '0.79rem', fontWeight: 600 }}>
              Deferred reason: {response.deferredReason}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {metadata.map((item) => (
              <div key={item.label} style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '0.5rem', background: '#fff' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '0.2rem', color: 'var(--ink-strong)', fontSize: '0.8rem', fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
