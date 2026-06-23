// BKT AI-Apply — tiny router shared by the Vite app (path-based, full page
// navigation like the rest of the codebase) and the design-review UAT
// harness (hash-based so a single static file can host every route).
import { useEffect, useState } from 'react'
import type { NavKey } from './types'

declare global {
  interface Window {
    __BKT_ROUTE_MODE__?: 'hash' | 'path'
  }
}

const ROUTES: Record<string, NavKey> = {
  '/': 'dashboard',
  '/inbox': 'inbox',
  '/search': 'search',
  '/saved': 'saved',
  '/preferences': 'prefs',
  '/resumes': 'resumes',
  '/cover-letters': 'letters',
  '/interview-prep': 'interview-prep',
  '/notifications': 'notifications',
  '/pipeline': 'pipeline',
  '/ingestion': 'ingestion',
  '/settings': 'integrations',
}

export const NAV_PATHS: Record<NavKey, string> = Object.fromEntries(Object.entries(ROUTES).map(([path, key]) => [key, path])) as Record<
  NavKey,
  string
>

function isHashMode(): boolean {
  return typeof window !== 'undefined' && window.__BKT_ROUTE_MODE__ === 'hash'
}

export function currentPath(): string {
  if (isHashMode()) return window.location.hash.replace(/^#/, '') || '/'
  return window.location.pathname
}

export function currentNavKey(): NavKey {
  return ROUTES[currentPath()] ?? 'dashboard'
}

export function navigate(key: NavKey): void {
  const path = NAV_PATHS[key] ?? '/'
  if (isHashMode()) {
    window.location.hash = path
    return
  }
  window.location.assign(path)
}

/** Reactive route hook — re-renders on hashchange in harness mode. */
export function useNavKey(): NavKey {
  const [key, setKey] = useState<NavKey>(() => currentNavKey())
  useEffect(() => {
    if (!isHashMode()) return
    const onHash = () => setKey(currentNavKey())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return key
}
