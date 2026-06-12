// BKT AI-Apply — Inbox: master-detail mail client.
// Ported 1:1 from the design-system UI kit (InboxScreen.jsx).
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/bkt/Icon'
import { BktAvatar } from '@/components/bkt/BktAvatar'
import { BktButton } from '@/components/bkt/BktButton'
import { companyLogo, formatStamp } from '@/components/bkt/format'
import type { ToastFn } from '@/components/bkt/toast'
import type { EmailMessage, InboxData, InboxLabel } from '../types'

function labelMeta(labels: InboxLabel[], id: string): InboxLabel {
  return labels.find((l) => l.id === id) ?? labels[0] ?? { id: 'all', name: 'All Labels', icon: 'tag', color: 'var(--bkt-zinc-500)' }
}

function LabelPill({ label }: { label: InboxLabel }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 'var(--radius-pill)',
        padding: '3px 9px',
        font: '700 var(--text-2xs)/1 var(--font-body)',
        letterSpacing: 'var(--tracking-wide)',
        color: label.color,
        background: `color-mix(in oklab, ${label.color} 13%, transparent)`,
      }}
    >
      <Icon name={label.icon} size={12} strokeWidth={2.2} />
      {label.name}
    </span>
  )
}

function PriorityPill({ priority }: { priority: 'Low' | 'High' }) {
  const high = priority === 'High'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-pill)',
        padding: '3px 9px',
        font: '700 var(--text-2xs)/1 var(--font-body)',
        letterSpacing: 'var(--tracking-wide)',
        color: high ? 'var(--bkt-danger-ink)' : 'var(--bkt-zinc-600)',
        background: high ? 'var(--bkt-danger-soft)' : 'var(--bkt-zinc-200)',
      }}
    >
      {priority}
    </span>
  )
}

interface DropdownItem {
  id: string
  name: string
  icon: string
  color?: string
}

function FilterDropdown({
  icon,
  label,
  active = false,
  items,
  value,
  onPick,
  width = 224,
}: {
  icon: string
  label: string
  active?: boolean
  items: DropdownItem[]
  value: string
  onPick: (id: string) => void
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bkt-press"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 34,
          padding: '0 12px',
          background: active ? 'var(--accent)' : 'var(--surface)',
          border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
          font: '600 var(--text-sm)/1 var(--font-body)',
          color: active ? 'var(--accent-foreground)' : 'var(--text-strong)',
        }}
      >
        <Icon name={icon} size={15} color={active ? 'var(--primary)' : 'var(--bkt-zinc-500)'} />
        {label}
        <Icon
          name="chevron-down"
          size={14}
          color="var(--bkt-zinc-500)"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-standard)' }}
        />
      </button>
      {open && (
        <div
          className="bkt-enter bkt-scroll"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 8px)',
            width,
            zIndex: 60,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                onPick(it.id)
                setOpen(false)
              }}
              className="bkt-press"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: it.id === value ? 'var(--accent)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                font: '500 var(--text-sm)/1.2 var(--font-body)',
                color: 'var(--text-strong)',
                transition: 'background var(--dur-fast) var(--ease-standard)',
              }}
              onMouseEnter={(e) => {
                if (it.id !== value) e.currentTarget.style.background = 'var(--bkt-zinc-100)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = it.id === value ? 'var(--accent)' : 'transparent'
              }}
            >
              <Icon name={it.icon} size={16} color={it.color || 'var(--bkt-zinc-500)'} />
              <span style={{ flex: 1 }}>{it.name}</span>
              {it.id === value && <Icon name="check" size={15} color="var(--primary)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const FOLDERS: DropdownItem[] = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox' },
  { id: 'sent', name: 'Sent', icon: 'send' },
  { id: 'deleted', name: 'Deleted', icon: 'trash-2' },
]

export interface InboxScreenProps {
  data: InboxData
  onToast: ToastFn
  dateOrder?: 'dmy' | 'mdy'
  onRefresh?: () => void
}

export function InboxScreen({ data, onToast, dateOrder = 'dmy', onRefresh }: InboxScreenProps) {
  const [folder, setFolder] = useState('inbox')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [labelFilter, setLabelFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [emails, setEmails] = useState<EmailMessage[]>(data.emails)
  const [selectedId, setSelectedId] = useState<EmailMessage['id'] | null>(data.emails[0]?.id ?? null)
  const [deletedIds, setDeletedIds] = useState<EmailMessage['id'][]>([])
  const [spinning, setSpinning] = useState(false)

  // Re-seed local state when a fresh dataset arrives (live reload) —
  // adjust-state-during-render keyed on the incoming dataset identity.
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setEmails(data.emails)
    setSelectedId(data.emails[0]?.id ?? null)
    setDeletedIds([])
  }

  const visible = emails.filter((e) => {
    if (folder === 'deleted') return deletedIds.includes(e.id)
    if (deletedIds.includes(e.id)) return false
    if (folder === 'sent') return false
    if (unreadOnly && !e.unread) return false
    if (labelFilter !== 'all' && e.label !== labelFilter) return false
    const q = query.trim().toLowerCase()
    if (q && !(e.from.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q) || e.sender.toLowerCase().includes(q))) return false
    return true
  })

  const selected = emails.find((e) => e.id === selectedId) ?? null
  const selectedVisible = selected != null && visible.some((e) => e.id === selected.id)

  const openEmail = (id: EmailMessage['id']) => {
    setSelectedId(id)
    setEmails((es) => es.map((e) => (e.id === id ? { ...e, unread: false } : e)))
  }
  const del = (id: EmailMessage['id']) => {
    setDeletedIds((d) => [...d, id])
    onToast('Moved to Deleted', 'trash-2', 'var(--bkt-zinc-300)')
    const rest = visible.filter((e) => e.id !== id)
    setSelectedId(rest.length ? rest[0]!.id : null)
  }
  const refresh = () => {
    setSpinning(true)
    onRefresh?.()
    setTimeout(() => {
      setSpinning(false)
      onToast('Inbox up to date', 'refresh-cw', 'var(--bkt-blue-300)')
    }, 700)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 28px 0' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 0 12px' }}>
        <h1 style={{ font: '600 var(--text-2xl)/1.1 var(--font-display)', letterSpacing: 'var(--tracking-tighter)', margin: 0 }}>Inbox</h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 30,
            padding: '0 11px',
            background: 'var(--bkt-zinc-100)',
            borderRadius: 'var(--radius-pill)',
            font: '500 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-body)',
          }}
        >
          <Icon name="mail" size={14} color="var(--bkt-zinc-500)" />
          {data.account}
          <Icon name="info" size={13} color="var(--bkt-zinc-400)" />
        </span>
        <div style={{ flex: 1 }}></div>
        <button
          className="bkt-press"
          onClick={() => onToast(`${data.invitations} interview invitations`, 'calendar', 'var(--bkt-success)')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 34,
            padding: '0 14px',
            background: 'var(--bkt-blue-50)',
            border: '1px solid color-mix(in oklab, var(--primary) 30%, transparent)',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            font: '600 var(--text-sm)/1 var(--font-body)',
            color: 'var(--bkt-blue-700)',
          }}
        >
          <Icon name="calendar-check" size={15} color="var(--primary)" />
          {data.invitations} Interview invitations
        </button>
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 14 }}>
        <FilterDropdown icon="inbox" label={FOLDERS.find((f) => f.id === folder)?.name ?? 'Inbox'} items={FOLDERS} value={folder} onPick={setFolder} width={180} />
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }}></span>
        <button
          onClick={() => setUnreadOnly((u) => !u)}
          className="bkt-press"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 34,
            padding: '0 12px',
            background: unreadOnly ? 'var(--accent)' : 'var(--surface)',
            border: `1px solid ${unreadOnly ? 'transparent' : 'var(--border)'}`,
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            font: '600 var(--text-sm)/1 var(--font-body)',
            color: unreadOnly ? 'var(--accent-foreground)' : 'var(--text-strong)',
          }}
        >
          <Icon name="mail-open" size={15} color={unreadOnly ? 'var(--primary)' : 'var(--bkt-zinc-500)'} />
          Unread only
        </button>
        <FilterDropdown
          icon="tag"
          label={labelMeta(data.labels, labelFilter).name}
          active={labelFilter !== 'all'}
          items={data.labels}
          value={labelFilter}
          onPick={setLabelFilter}
          width={248}
        />
        <div style={{ flex: 1 }}></div>
        <div style={{ position: 'relative' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emails..."
            style={{
              height: 34,
              width: 220,
              padding: '0 34px 0 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              font: '400 var(--text-sm)/1 var(--font-body)',
              color: 'var(--text-strong)',
              outline: 'none',
            }}
          />
          <Icon name="search" size={15} color="var(--bkt-zinc-400)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
        </div>
        <button
          className="bkt-press"
          onClick={() => onToast('Reported — our team will take a look', 'circle-alert', 'var(--bkt-warning)')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 34,
            padding: '0 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            font: '500 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-body)',
          }}
        >
          <Icon name="circle-alert" size={15} color="var(--bkt-zinc-500)" />
          Something wrong?
        </button>
        <button
          className="bkt-press"
          onClick={refresh}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 34,
            padding: '0 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
            font: '500 var(--text-sm)/1 var(--font-body)',
            color: 'var(--text-body)',
          }}
        >
          <Icon name="refresh-cw" size={15} color="var(--bkt-zinc-500)" style={{ animation: spinning ? 'bkt-spin 0.7s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* master-detail */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 0, borderTop: '1px solid var(--border)' }}>
        {/* list */}
        <div className="bkt-scroll" style={{ width: 440, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
          {visible.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', font: '400 var(--text-sm)/1.5 var(--font-body)' }}>
              {folder === 'sent' ? 'No sent mail yet.' : folder === 'deleted' ? 'Deleted is empty.' : 'No emails match these filters.'}
            </div>
          )}
          <div className="bkt-stagger-rows">
            {visible.map((e) => {
              const active = selected != null && e.id === selected.id
              return (
                <div
                  key={e.id}
                  onClick={() => openEmail(e.id)}
                  className="bkt-press"
                  style={{
                    cursor: 'pointer',
                    padding: '13px 16px 13px 14px',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${active ? 'var(--primary)' : 'transparent'}`,
                    background: active ? 'var(--accent)' : 'var(--surface)',
                    transition: 'background var(--dur-fast) var(--ease-standard)',
                  }}
                  onMouseEnter={(ev) => {
                    if (!active) ev.currentTarget.style.background = 'var(--bkt-zinc-50)'
                  }}
                  onMouseLeave={(ev) => {
                    if (!active) ev.currentTarget.style.background = 'var(--surface)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }}></span>}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        font: `${e.unread ? 700 : 600} var(--text-sm)/1.3 var(--font-body)`,
                        color: 'var(--text-strong)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.from}
                    </span>
                    <span style={{ font: '400 var(--text-2xs)/1 var(--font-stamp, var(--font-mono))', color: 'var(--text-subtle)', flexShrink: 0 }}>
                      {formatStamp(e.time, dateOrder)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      font: `${e.unread ? 600 : 400} var(--text-sm)/1.4 var(--font-body)`,
                      color: e.unread ? 'var(--text-strong)' : 'var(--text-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.subject}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <LabelPill label={labelMeta(data.labels, e.label)} />
                    <PriorityPill priority={e.priority} />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '14px 0', color: 'var(--text-muted)' }}>
            <Icon name="arrow-left" size={16} />
            <span className="bkt-num" style={{ font: '500 var(--text-sm)/1 var(--font-body)' }}>
              1–{visible.length} of {data.total}
            </span>
            <Icon name="arrow-right" size={16} color="var(--text-strong)" />
          </div>
        </div>

        {/* reading pane */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {selected && selectedVisible ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h2 style={{ font: '600 var(--text-xl)/1.25 var(--font-display)', letterSpacing: 'var(--tracking-tight)', margin: 0, color: 'var(--text-strong)' }}>
                    {selected.subject}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ font: '500 var(--text-sm)/1 var(--font-body)', color: 'var(--text-muted)' }}>{selected.from}</span>
                    <LabelPill label={labelMeta(data.labels, selected.label)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <BktButton
                    variant="outline"
                    size="sm"
                    iconLeft={<Icon name="circle-x" size={14} />}
                    onClick={() => onToast('Snoozed — Not this time', 'circle-x', 'var(--bkt-zinc-300)')}
                  >
                    Not this time
                  </BktButton>
                  <BktButton variant="outline" size="sm" iconLeft={<Icon name="reply" size={14} />} onClick={() => onToast('Reply drafted', 'reply', 'var(--bkt-blue-300)')}>
                    Reply
                  </BktButton>
                  <BktButton
                    variant="outline"
                    size="sm"
                    iconLeft={<Icon name="forward" size={14} />}
                    onClick={() => onToast('Forwarding…', 'forward', 'var(--bkt-blue-300)')}
                  >
                    Forward
                  </BktButton>
                  <BktButton variant="outline" size="sm" iconLeft={<Icon name="trash-2" size={14} />} onClick={() => del(selected.id)}>
                    Delete
                  </BktButton>
                </div>
              </div>
              <div key={String(selected.id)} className="bkt-blur-in bkt-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <BktAvatar name={selected.sender} src={companyLogo(selected.domain)} size={40} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ font: '600 var(--text-base)/1.3 var(--font-body)', color: 'var(--text-strong)' }}>{selected.sender}</span>
                    <span style={{ font: '400 var(--text-xs)/1.3 var(--font-stamp, var(--font-mono))', color: 'var(--text-subtle)' }}>
                      {formatStamp(selected.time, dateOrder)}
                    </span>
                  </div>
                </div>
                <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {selected.body.map((p, i) => (
                    <p key={i} style={{ margin: 0, font: '400 var(--text-base)/1.65 var(--font-body)', color: 'var(--text-body)' }}>
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
              <Icon name="mail" size={26} />
              <span style={{ font: '600 var(--text-md)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>Select an email</span>
              <span style={{ font: '400 var(--text-sm)/1.4 var(--font-body)' }}>Choose a message from the list to read it here.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
