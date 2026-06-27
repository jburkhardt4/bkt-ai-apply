// BKT AI-Apply — theme resolution (light / dark / system).
//
// The bkt palette flips entirely on the `data-theme="dark"` attribute on
// <html> (see src/styles/bkt.css); there is no `.dark` class and the app does
// not key on `prefers-color-scheme` directly — the *resolved* scheme is written
// to the attribute here so the tokens (and therefore every surface) follow.
//
// This module is pure (no React) so the same logic powers three callers in
// lockstep: the FOUC inline script in index.html (hand-inlined copy — it must
// run before the bundle loads), the ThemeProvider, and the visual-QA harness.
// Keep the STORAGE_KEY + colors + resolution rule identical across all three.

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** localStorage key. Mirrored verbatim by the index.html FOUC script. */
export const THEME_STORAGE_KEY = 'bkt-theme'

/** `<meta name="theme-color">` per resolved scheme — the light value is the app
 *  surface (#ffffff) and the dark value is the dark `--background` (#0c0c0e), so
 *  the iOS status/address-bar region matches the page. Mirrored in index.html. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#0c0c0e',
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** The OS-level preference. Defensive against jsdom/SSR where matchMedia is absent. */
export function systemPrefersDark(): boolean {
  return canMatchMedia() ? window.matchMedia(DARK_QUERY).matches : false
}

/** Read + validate the stored mode; defaults to `system` (modern, accessible
 *  default — the explicit System option in the toggle keeps it transparent). */
export function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage can throw (private mode / disabled cookies) — fall through.
  }
  return 'system'
}

export function persistMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Best-effort: a failed write just means the choice isn't remembered.
  }
}

/** Collapse a mode (which may be `system`) to the concrete scheme to render. */
export function resolveMode(mode: ThemeMode, prefersDark: boolean = systemPrefersDark()): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode
}

/** Single authority for the DOM side-effects of a resolved scheme: the
 *  `data-theme` attribute the tokens key on, the UA `color-scheme` (native
 *  scrollbars / form controls / autofill), and the status-bar `theme-color`.
 *  Idempotent, so the FOUC script and the provider can both call it safely. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved])
}
