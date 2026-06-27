// BKT AI-Apply — theme context + hook. Split out from the provider component so
// it never trips `react-refresh/only-export-components` (mirrors auth-context.ts
// next to AuthContext.tsx). Theme is global UI state, not data fetching, so the
// hook is fine to consume from presentational chrome (same as useAuth).
import { createContext, useContext } from 'react'
import type { ThemeMode, ResolvedTheme } from '@/lib/theme'

export interface ThemeContextValue {
  /** The user's choice — may be `system`. */
  mode: ThemeMode
  /** The concrete scheme actually rendered (`system` collapsed via OS preference). */
  resolved: ResolvedTheme
  /** Pick a mode (persisted to localStorage). */
  setMode: (mode: ThemeMode) => void
  /** Flip to the opposite of the resolved scheme — used by the quick toggle. */
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
