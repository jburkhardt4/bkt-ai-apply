// BKT AI-Apply — design-system toast stack (ported from the UI kit).
// Dark zinc capsules, bottom-right, auto-dismiss after 3.2s.
// Exposed via <BktToastProvider> + useBktToast().
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { ToastContext } from './toast-context'
import type { ToastFn } from './toast-context'
import type { ToastItem } from '@/features/auto-apply/types'

export type { ToastFn } from './toast-context'

export function BktToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback<ToastFn>((msg, icon = 'check', color = 'var(--bkt-success)') => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { id, msg, icon, color }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200)
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="bkt-toast-stack" style={{ position: 'fixed', right: 20, bottom: 'calc(20px + var(--safe-bottom))', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 260,
              maxWidth: 360,
              background: 'var(--bkt-zinc-900)',
              color: 'var(--bkt-zinc-100)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              boxShadow: 'var(--shadow-lg)',
              font: '500 var(--text-sm)/1.4 var(--font-body)',
              animation: 'bkt-toast-in var(--dur-medium) var(--ease-out) both',
            }}
          >
            <Icon name={t.icon} size={16} color={t.color} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
