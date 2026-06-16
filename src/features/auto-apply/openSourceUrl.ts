// BKT AI-Apply — shared "open the original posting" helper.
// Split into a .ts module (no component export) so the two call sites
// (JDSidebar "View Job", SearchScreen "Go to Listing") and the dashboard
// manual-apply path share one definition without tripping
// react-refresh/only-export-components.

/** Opens a job's source posting in a new tab when it is a valid http(s) URL.
 *  Returns true iff a window was opened. */
export function openSourceUrl(url: string | null | undefined): boolean {
  if (url && /^https?:\/\//i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}
