// BKT AI-Apply — on-screen keyboard inset via the VisualViewport API.
// Returns the height (CSS px) currently covered by the software keyboard, so a
// bottom-pinned composer can reserve that space and stay visible. iOS Safari
// overlays the keyboard WITHOUT resizing the layout viewport (interactive-widget
// is unsupported there), so this manual reservation is required on the primary
// device. Returns 0 on desktop / when no keyboard is shown.
//
// Mirrors useIsMobile's shape — lazy initial value + a listener-only effect — so
// it never trips react-hooks/set-state-in-effect (no synchronous setState in the
// effect body).
import { useEffect, useState } from 'react'

function computeInset(): number {
  if (typeof window === 'undefined') return 0
  const vv = window.visualViewport
  if (!vv) return 0
  // The keyboard covers the gap between the layout-viewport bottom and the
  // (shorter, possibly offset) visual viewport.
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState<number>(computeInset)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onChange = () => setInset(computeInset())
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    return () => {
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
    }
  }, [])

  return inset
}
