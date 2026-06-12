// BKT AI-Apply — static asset resolver for the redesigned UI.
// In the Vite app, files under public/ serve from the site root ('/brand/…').
// The design-review UAT harness sets window.__BKT_ASSET_BASE__ so the same
// components resolve assets relative to the project filesystem.
declare global {
  interface Window {
    __BKT_ASSET_BASE__?: string
  }
}

export function brandAsset(path: string): string {
  const base = typeof window !== 'undefined' ? (window.__BKT_ASSET_BASE__ ?? '') : ''
  return base + path
}
