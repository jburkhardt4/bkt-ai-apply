// BKT AI-Apply — shared behaviour for hand-rolled fixed overlays (nav drawer,
// AI-assistant slide-over, JD sidebar). Adds the things a bespoke overlay
// usually forgets: Escape-to-close, background scroll-lock, and moving focus
// into the panel on open (restoring it on close). The panel element should set
// role="dialog", aria-modal="true", and tabIndex={-1} so the focus move lands.
//
// Deliberately lightweight (not a full focus trap / Radix Dialog) to keep the
// existing slide animations and z-index ordering untouched while closing the
// a11y + tactile gaps. The scrim already blocks pointer scroll; the scroll-lock
// class additionally freezes the main region for keyboard/momentum scrolling.
import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
): void {
  // Scroll-lock + initial focus — keyed on `open` only so an identity-unstable
  // onClose (call sites pass inline arrows) can't re-run this and steal focus
  // on every render.
  useEffect(() => {
    if (!open) return
    document.documentElement.classList.add('bkt-overlay-open')
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      document.documentElement.classList.remove('bkt-overlay-open')
      previouslyFocused?.focus?.()
    }
  }, [open, panelRef])

  // Escape-to-close — cheap to re-bind when onClose's identity changes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
}
