// BKT AI-Apply — theme provider. Owns the light/dark/system mode, mirrors it to
// the DOM (data-theme + color-scheme + theme-color via applyResolvedTheme), and
// keeps `system` live by tracking the OS preference.
//
// set-state-in-effect discipline (react-hooks/set-state-in-effect, error level):
// both pieces of state are seeded lazily in useState and only ever mutated from
// listeners/handlers — never synchronously in an effect body. The OS-preference
// effect is listener-only (mirrors useIsMobile / useKeyboardInset); the apply
// effect performs a DOM write, not a setState. `resolved` is derived in render.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  applyResolvedTheme,
  getStoredMode,
  persistMode,
  resolveMode,
  systemPrefersDark,
} from '@/lib/theme'
import type { ThemeMode } from '@/lib/theme'
import { ThemeContext } from '@/contexts/theme-context'
import type { ThemeContextValue } from '@/contexts/theme-context'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode)
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark)

  // Track the OS preference so `system` mode follows it live. Listener-only —
  // no synchronous setState in the effect body.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveMode(mode, prefersDark)

  // Reflect the resolved scheme to the DOM. This is a DOM write (idempotent),
  // not a setState — so it's an allowed effect body. The FOUC script already
  // applied the same on first paint; this keeps it in sync on every change.
  useEffect(() => {
    applyResolvedTheme(resolved)
  }, [resolved])

  const value = useMemo<ThemeContextValue>(() => {
    const setMode = (next: ThemeMode) => {
      persistMode(next)
      setModeState(next)
    }
    return {
      mode,
      resolved,
      setMode,
      toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    }
  }, [mode, resolved])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
