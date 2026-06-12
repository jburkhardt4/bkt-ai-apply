// BKT AI-Apply — dashboard chrome ported from the design-system UI kit:
// TopBar (credits capsule, budget CTA), ModeTabs (sliding underline),
// ReviewModeMenu (3 modes), BudgetModal (validated $20–$5,000), and the
// PlaceholderScreen for not-yet-designed sections.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktBadge } from '@/components/bkt/BktBadge'
import { BktButton } from '@/components/bkt/BktButton'
import { BktInput } from '@/components/bkt/BktInput'
import { brandAsset } from '../assets'
import { REVIEW_MODES } from '../reviewModes'
import type { ReviewModeId } from '../types'

/* ---- Top bar: title, live badge, segmented credits capsule, budget CTA ---- */
export function TopBar({ credits, onBudget, onGetCredits }: { credits: number; onBudget: () => void; onGetCredits: () => void }) {
  const [hoverGift, setHoverGift] = useState(false)
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 28px 0' }}>
      <h1 style={{ font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', margin: 0 }}>Auto Apply</h1>
      <BktBadge tone="success" appearance="soft" dot pulse>
        Searching Now
      </BktBadge>
      <div style={{ flex: 1 }}></div>

      {/* segmented credits capsule */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, background: 'var(--bkt-zinc-100)', borderRadius: 'var(--radius-pill)', padding: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 6px 0 10px' }}>
          <img src={brandAsset('/brand/bkt-web-app-logo.png')} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 6 }} />
          <span className="bkt-num" style={{ font: '600 var(--text-sm)/1 var(--font-body)', color: 'var(--text-strong)' }}>
            {credits} credits
          </span>
          <BktButton
            variant="primary"
            size="sm"
            style={{ height: 28, padding: '0 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', boxShadow: 'none' }}
            onClick={onGetCredits}
          >
            Get more
          </BktButton>
        </span>
        <button
          onMouseEnter={() => setHoverGift(true)}
          onMouseLeave={() => setHoverGift(false)}
          onClick={onGetCredits}
          className="bkt-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 14px 0 11px',
            background: hoverGift ? 'var(--bkt-blue-50)' : 'transparent',
            border: '1px dashed color-mix(in oklab, var(--primary) 40%, transparent)',
            borderColor: hoverGift ? 'color-mix(in oklab, var(--primary) 60%, transparent)' : undefined,
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            font: '500 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-strong)',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="gift" size={15} color="var(--primary)" />
          Get Free Credits
        </button>
      </div>

      <BktButton variant="primary" size="md" style={{ borderRadius: 'var(--radius-pill)' }} onClick={onBudget}>
        Update Monthly Budget
      </BktButton>
    </header>
  )
}

/* ---- Mode tabs with sliding underline (200ms, ease-standard) ---- */
function ModeTab({
  active,
  icon,
  label,
  count,
  onClick,
  buttonRef,
}: {
  active: boolean
  icon: string
  label: string
  count?: number
  onClick: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className="bkt-press"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 8px 14px',
        background: 'none',
        border: 'none',
        font: '600 var(--text-md)/1 var(--font-body)',
        color: active ? 'var(--text-strong)' : 'var(--bkt-zinc-400)',
        cursor: 'pointer',
        transition: 'color var(--dur-fast) var(--ease-standard)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--bkt-zinc-600)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--bkt-zinc-400)'
      }}
    >
      <Icon name={icon} size={16} color={active ? 'var(--primary)' : 'currentColor'} />
      {label}
      {count != null && (
        <span
          className="bkt-num"
          style={{
            font: '500 var(--text-xs)/1 var(--font-body)',
            color: 'var(--bkt-zinc-500)',
            background: 'var(--bkt-zinc-100)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 8px',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function ModeTabs({
  mode,
  setMode,
  reviewCount,
}: {
  mode: 'review' | 'jobs'
  setMode: (m: 'review' | 'jobs') => void
  reviewCount: number
}) {
  const reviewRef = useRef<HTMLButtonElement>(null)
  const jobsRef = useRef<HTMLButtonElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  // Position the sliding underline by mutating the span directly (DOM
  // synchronization, no state) — the CSS transition animates the move.
  useLayoutEffect(() => {
    const el = (mode === 'review' ? reviewRef : jobsRef).current
    const bar = barRef.current
    if (el && bar) {
      bar.style.left = `${el.offsetLeft}px`
      bar.style.width = `${el.offsetWidth}px`
    }
  }, [mode])

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 16 }}>
      <span
        ref={barRef}
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 0,
          height: 2,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--primary)',
          left: 0,
          width: 0,
          transition: 'left 200ms var(--ease-standard), width 200ms var(--ease-standard)',
        }}
      ></span>
      <ModeTab buttonRef={reviewRef} active={mode === 'review'} icon="layers" label="Quick Review" onClick={() => setMode('review')} />
      <ModeTab buttonRef={jobsRef} active={mode === 'jobs'} icon="list-checks" label="Your Jobs" count={reviewCount} onClick={() => setMode('jobs')} />
    </div>
  )
}

/* ---- Review mode dropdown (3 modes) ---- */
export function ReviewModeMenu({ value, onChange }: { value: ReviewModeId; onChange: (m: ReviewModeId) => void }) {
  const [open, setOpen] = useState(false)
  const current = REVIEW_MODES.find((m) => m.id === value) ?? REVIEW_MODES[0]!
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          font: '500 var(--text-sm)/1 var(--font-body)',
          color: 'var(--text-strong)',
          cursor: 'pointer',
        }}
      >
        <Icon name={current.icon} size={15} color="var(--primary)" />
        {current.label}
        <Icon
          name="chevron-down"
          size={14}
          color="var(--bkt-zinc-500)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
        />
      </button>
      {open && (
        <div
          className="bkt-enter"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 288,
            zIndex: 60,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {REVIEW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id)
                setOpen(false)
              }}
              className="bkt-press"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '9px 10px',
                background: m.id === value ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'background var(--dur-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => {
                if (m.id !== value) e.currentTarget.style.background = 'var(--bkt-zinc-100)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = m.id === value ? 'var(--accent)' : 'transparent'
              }}
            >
              <Icon name={m.icon} size={16} color={m.id === value ? 'var(--primary)' : 'var(--bkt-zinc-500)'} style={{ marginTop: 2 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ font: '600 var(--text-sm)/1.2 var(--font-body)', color: 'var(--text-strong)' }}>{m.label}</span>
                <span style={{ font: '400 var(--text-xs)/1.45 var(--font-body)', color: 'var(--text-muted)' }}>{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---- Budget modal with validation ($20–$5,000) ---- */
export function BudgetModal({ open, onClose, budget, onSave }: { open: boolean; onClose: () => void; budget: number; onSave: (n: number) => void }) {
  if (!open) return null
  // Content mounts fresh on each open, so the draft state below starts from
  // the current budget without any reset effect.
  return <BudgetModalContent onClose={onClose} budget={budget} onSave={onSave} />
}

function BudgetModalContent({ onClose, budget, onSave }: { onClose: () => void; budget: number; onSave: (n: number) => void }) {
  const [value, setValue] = useState(String(budget))
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const n = Number(value.replace(/[$,\s]/g, ''))
    if (!value.trim() || Number.isNaN(n)) return setError('Enter a number, e.g. 240')
    if (n < 20) return setError('Minimum monthly budget is $20.')
    if (n > 5000) return setError('Maximum monthly budget is $5,000.')
    onSave(n)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,16,19,0.32)', animation: 'bkt-fade-up 0.2s var(--ease-out) both' }}></div>
      <div
        className="bkt-enter"
        style={{
          position: 'relative',
          width: 420,
          background: 'var(--surface)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ font: '600 var(--text-lg)/1.2 var(--font-display)', margin: 0 }}>Update Monthly Budget</h3>
          <BktButton variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </BktButton>
        </div>
        <p style={{ margin: 0, font: '400 var(--text-sm)/1.55 var(--font-body)', color: 'var(--text-muted)' }}>
          Credits renew on the 1st of each month. Unused credits roll over for 30 days.
        </p>
        <BktInput
          label="Monthly budget (USD)"
          value={value}
          error={error}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          iconLeft={<span style={{ font: '600 13px/1 var(--font-mono)', color: 'var(--text-muted)' }}>$</span>}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <BktButton variant="secondary" onClick={onClose}>
            Cancel
          </BktButton>
          <BktButton variant="primary" onClick={submit}>
            Save Budget
          </BktButton>
        </div>
      </div>
    </div>
  )
}

/* ---- Placeholder for not-yet-designed sections ---- */
export function PlaceholderScreen({ label }: { label: string }) {
  return (
    <div className="bkt-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
      <Icon name="layout-template" size={26} />
      <span style={{ font: '600 var(--text-md)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>{label}</span>
      <span style={{ font: '400 var(--text-sm)/1.4 var(--font-body)' }}>This section is coming soon.</span>
    </div>
  )
}
