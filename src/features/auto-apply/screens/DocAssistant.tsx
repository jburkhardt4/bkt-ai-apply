// BKT AI-Apply — DocAssistant: the AI Resume / Letter Writer chat.
// Ported 1:1 from the design-system UI kit (DocAssistant.jsx).
// Two embed designs: "rail" (docked right panel) and "floating" (pill launcher).
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktButton } from '@/components/bkt/BktButton'
import type { DocsData, JobMatch, SearchJob } from '../types'
import type { DocType } from './DocPaper'
import { askDocWriter } from '../services/docWriterService'

const DA_CSS = `
@keyframes da-dot { 0%, 60%, 100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@keyframes da-pop { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
`

export type AiTargetJob = Pick<JobMatch | SearchJob, 'title' | 'company'> & { skills?: string[] }

interface Message {
  who: 'ai' | 'me'
  text: string
  patch?: string
  patchTarget?: string
  patchLabel?: string
}

function DATyping() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, padding: '10px 14px', background: 'var(--bkt-zinc-100)', borderRadius: '14px 14px 14px 4px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bkt-zinc-500)', animation: `da-dot 1.1s ${i * 0.15}s infinite var(--ease-standard)` }}
        ></span>
      ))}
    </span>
  )
}

function DAMessage({ m, onPatch }: { m: Message; onPatch: (target: string | undefined, text: string) => void }) {
  const me = m.who === 'me'
  return (
    <div className="bkt-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', gap: 6 }}>
      <div
        style={{
          maxWidth: '88%',
          padding: '9px 13px',
          background: me ? 'var(--primary)' : 'var(--bkt-zinc-100)',
          color: me ? '#fff' : 'var(--text-body)',
          borderRadius: me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          font: '400 var(--text-sm)/1.5 var(--font-body)',
        }}
      >
        {m.text}
      </div>
      {m.patch && (
        <div
          style={{
            maxWidth: '88%',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            padding: '11px 13px',
            background: 'var(--bkt-blue-50)',
            border: '1px solid color-mix(in oklab, var(--primary) 28%, transparent)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <span style={{ font: '400 var(--text-sm)/1.5 var(--font-body)', color: 'var(--text-body)', fontStyle: 'italic' }}>"{m.patch}"</span>
          <BktButton
            variant="primary"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            iconLeft={<Icon name="check" size={13} />}
            onClick={() => onPatch(m.patchTarget, m.patch ?? '')}
          >
            {m.patchLabel || 'Apply'}
          </BktButton>
        </div>
      )}
    </div>
  )
}

/** The chat core (thread + chips + composer), shared by both embed designs. */
function DAChat({
  type,
  ai,
  userId,
  lastJob,
  onPatch,
  compact = false,
}: {
  type: DocType
  ai: DocsData['ai']
  userId: string | null
  lastJob: AiTargetJob
  onPatch: (target: string | undefined, text: string) => void
  compact?: boolean
}) {
  const [msgs, setMsgs] = useState<Message[]>([
    {
      who: 'ai',
      text:
        type === 'resume'
          ? `I read your resume and your pipeline. ${lastJob.company}'s ${lastJob.title} posting is your most recent target. Want help tightening anything?`
          : `I can draft, tighten, or re-tone this letter. Your latest target is ${lastJob.title} at ${lastJob.company}. Say the word and I'll tailor it.`,
    },
  ])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const convoRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chips = ai.suggestions[type]
  // Resume edits flow into the summary; letter edits into the first body para.
  const patchTarget = type === 'resume' ? 'summary' : 'body0'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, typing])

  // Demo preview (no auth): pre-baked reply lookup. Live: real ai-chat turn.
  const demoReply = (key: string) => {
    const r = ai.replies[type][key]
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      setMsgs((ms) => [
        ...ms,
        r
          ? { who: 'ai', text: r.text, patch: r.patch, patchTarget: r.patchTarget, patchLabel: r.patchLabel }
          : {
              who: 'ai',
              text: 'Quick take: lead with outcomes, keep bullets to one line, and mirror the posting\u2019s exact phrasing. For a targeted rewrite, tap one of the suggestions below.',
            },
      ])
    }, 950)
  }

  const liveReply = async (text: string) => {
    setTyping(true)
    try {
      const result = await askDocWriter({
        userId: userId as string,
        type,
        lastJob,
        conversationId: convoRef.current,
        message: text,
      })
      convoRef.current = result.conversationId
      setMsgs((ms) => [
        ...ms,
        {
          who: 'ai',
          text: result.text,
          // Offer the reply as an applyable patch unless the model deferred.
          patch: result.status === 'answered' ? result.text : undefined,
          patchTarget: result.status === 'answered' ? patchTarget : undefined,
          patchLabel: result.status === 'answered' ? 'Apply to document' : undefined,
        },
      ])
    } catch (e: unknown) {
      // e.message is now the function's real, friendly error (e.g. a missing-key
      // notice) thanks to readEdgeFunctionError \u2014 surface it without the em-dash.
      setMsgs((ms) => [
        ...ms,
        { who: 'ai', text: e instanceof Error ? e.message : 'The writer is unavailable right now. Please try again.' },
      ])
    } finally {
      setTyping(false)
    }
  }

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || typing) return
    setMsgs((ms) => [...ms, { who: 'me', text: trimmed }])
    setDraft('')
    if (userId) void liveReply(trimmed)
    else demoReply(trimmed)
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="bkt-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: compact ? '14px 16px' : '16px 18px' }}
      >
        {msgs.map((m, i) => (
          <DAMessage key={i} m={m} onPatch={onPatch} />
        ))}
        {typing && <DATyping />}
      </div>
      <div style={{ padding: compact ? '0 16px 12px' : '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => send(c)}
            className="bkt-press"
            style={{
              padding: '6px 11px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              font: '500 var(--text-xs)/1.2 var(--font-body)',
              color: 'var(--text-body)',
              transition: 'border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.color = 'var(--bkt-blue-700)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-body)'
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: compact ? '0 16px 16px' : '0 18px 16px' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(draft)}
          placeholder="Ask the writer anything…"
          style={{
            flex: 1,
            minWidth: 0,
            height: 38,
            padding: '0 13px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)',
            outline: 'none',
            font: '400 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-strong)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--primary)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border)'
          }}
        />
        <BktButton variant="primary" size="icon" aria-label="Send" onClick={() => send(draft)} style={{ borderRadius: '50%' }}>
          <Icon name="arrow-up" size={16} strokeWidth={2.2} />
        </BktButton>
      </div>
    </>
  )
}

function DAHeader({ type, onClose }: { type: DocType; onClose?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          background: 'var(--bkt-gradient-shield, var(--primary))',
          borderRadius: 'var(--radius-lg)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Icon name="sparkles" size={16} />
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ font: '700 var(--text-sm)/1.2 var(--font-display)', color: 'var(--text-strong)' }}>
          AI {type === 'resume' ? 'Resume' : 'Letter'} Writer
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 var(--text-2xs)/1 var(--font-body)', color: 'var(--bkt-success)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>Online · knows your pipeline
        </span>
      </span>
      {onClose && (
        <BktButton variant="ghost" size="icon" aria-label="Close assistant" onClick={onClose}>
          <Icon name="chevrons-down" size={16} />
        </BktButton>
      )}
    </div>
  )
}

export function DocAssistant({
  type,
  variant,
  ai,
  userId,
  lastJob,
  onPatch,
  widthOverride = 332,
}: {
  type: DocType
  variant: 'rail' | 'floating'
  ai: DocsData['ai']
  userId: string | null
  lastJob: AiTargetJob
  onPatch: (target: string | undefined, text: string) => void
  /** Rail width — full-width on mobile (AppShell/DocBuilder pass '100%'); 332 desktop. */
  widthOverride?: number | string
}) {
  const [open, setOpen] = useState(false)

  if (variant === 'rail') {
    return (
      <aside style={{ width: widthOverride, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderLeft: widthOverride === 332 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
        <style>{DA_CSS}</style>
        <DAHeader type={type} />
        <DAChat type={type} ai={ai} userId={userId} lastJob={lastJob} onPatch={onPatch} />
      </aside>
    )
  }

  /* floating composer */
  return (
    <>
      <style>{DA_CSS}</style>
      {open && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            zIndex: 70,
            width: 372,
            height: 'min(540px, 72vh)',
            display: 'flex',
            flexDirection: 'column',
            background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
            backdropFilter: 'blur(14px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl, 20px)',
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden',
            animation: 'da-pop var(--dur-medium) var(--ease-out) both',
          }}
        >
          <DAHeader type={type} onClose={() => setOpen(false)} />
          <DAChat type={type} ai={ai} userId={userId} lastJob={lastJob} onPatch={onPatch} compact />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        aria-label="AI Writer"
        style={{
          position: 'fixed',
          right: 24,
          bottom: 26,
          zIndex: 70,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          height: 48,
          padding: '0 20px 0 16px',
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
          font: '600 var(--text-sm)/1 var(--font-body)',
          boxShadow: 'var(--shadow-brand, var(--shadow-lg))',
          transition: 'box-shadow var(--dur-base) var(--ease-standard)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-brand-hover, var(--shadow-xl))'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--shadow-brand, var(--shadow-lg))'
        }}
      >
        <Icon name={open ? 'chevrons-down' : 'sparkles'} size={17} />
        {open ? 'Hide Writer' : 'AI Writer'}
      </button>
    </>
  )
}
