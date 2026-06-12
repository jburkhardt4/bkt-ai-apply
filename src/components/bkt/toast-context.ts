// BKT AI-Apply — toast context + hook (split from toast.tsx so the
// component file only exports components, per
// react-refresh/only-export-components; same pattern as auth-context.ts).
import { createContext, useContext } from 'react'

export type ToastFn = (msg: string, icon?: string, color?: string) => void

export const ToastContext = createContext<ToastFn>(() => {})

export function useBktToast(): ToastFn {
  return useContext(ToastContext)
}
