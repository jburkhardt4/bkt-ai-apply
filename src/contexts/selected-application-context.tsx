import { createContext, useContext } from 'react'

interface SelectedApplicationContextValue {
  selectedApplicationId: string | null
  setSelectedApplicationId: (id: string | null) => void
}

export const SelectedApplicationContext = createContext<SelectedApplicationContextValue | null>(null)

export function useSelectedApplication(): SelectedApplicationContextValue {
  const ctx = useContext(SelectedApplicationContext)
  if (!ctx) throw new Error('useSelectedApplication must be used within AppShell')
  return ctx
}
