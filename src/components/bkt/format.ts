// BKT AI-Apply — non-component helpers shared by the bkt primitives and
// feature screens (split from bits.tsx so component files only export
// components, per react-refresh/only-export-components).

/** Company-logo resolver — jobs/emails carry a `domain` from the sourced
 *  posting link. Swap for the production logo service in one place. */
export function companyLogo(domain?: string | null): string | null {
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null
}

/** Format an absolute timestamp as "D/M/YYYY h:mm AM/PM" (no seconds).
 *  Pass order="mdy" for US month-first ordering. */
export function formatStamp(str: string, order: 'dmy' | 'mdy' = 'dmy'): string {
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const min = String(d.getMinutes()).padStart(2, '0')
  const date =
    order === 'mdy'
      ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
      : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  return `${date} ${h}:${min} ${ampm}`
}
