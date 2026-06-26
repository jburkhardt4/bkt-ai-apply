// BKT AI-Apply — viewport hook. Single source of truth for the mobile
// breakpoint used by the responsive refactor. Mobile = under 768px (the
// `<md` threshold the docs already use); at >= 768px every consumer renders
// the unchanged desktop layout. Mirrors the lazy-init + listener-only effect
// shape of useNavKey() in src/features/auto-apply/router.ts so it never trips
// the react-hooks/set-state-in-effect lint rule (no synchronous setState in
// the effect body — the lazy initializer seeds the value, the listener keeps
// it current).
import { useEffect, useState } from 'react'

/** The mobile breakpoint: phones / narrow viewports below Tailwind's `md`. */
export const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
