// BKT AI-Apply — Auto-Apply settings context (sibling to the provider
// component so this module exports no React component; mirrors the
// auth-context.ts split that keeps react-refresh/only-export-components
// happy). Provider lives in components/AutoApplySettingsProvider.tsx.
import { createContext, useContext } from 'react'
import type { SetStateAction } from 'react'
import { DEFAULT_SETTINGS, type AutoApplySettings } from './services/settingsService'

export interface AutoApplySettingsStore {
  settings: AutoApplySettings
  loading: boolean
  setField: <K extends keyof AutoApplySettings>(key: K, value: SetStateAction<AutoApplySettings[K]>) => void
}

export const AutoApplySettingsContext = createContext<AutoApplySettingsStore>({
  settings: DEFAULT_SETTINGS,
  loading: false,
  setField: () => undefined,
})

export function useAutoApplySettings(): AutoApplySettingsStore {
  return useContext(AutoApplySettingsContext)
}

/** Resolve a React SetStateAction against a previous value (value or updater fn). */
export function resolveSetStateAction<T>(action: SetStateAction<T>, prev: T): T {
  return typeof action === 'function' ? (action as (p: T) => T)(prev) : action
}
