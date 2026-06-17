// BKT AI-Apply — Pagination (ported pattern from the design system's "‹ X of N ›"
// footer). Presentational prev/next control for the paginated list surfaces
// (Prospector Search Results / Ready to Apply, Your Jobs table). Page is
// 0-based; the next page is emitted via onPageChange. Hides itself when there
// is only a single page so callers can render it unconditionally.
import type { CSSProperties } from 'react'
import { Icon } from './Icon'

export interface BktPaginationProps {
  /** Zero-based current page. */
  page: number
  /** Total number of pages (clamped to a minimum of 1). */
  pageCount: number
  onPageChange: (page: number) => void
  /** Render nothing when there is only one page. Default true. */
  hideWhenSingle?: boolean
  style?: CSSProperties
}

export function BktPagination({
  page,
  pageCount,
  onPageChange,
  hideWhenSingle = true,
  style = {},
}: BktPaginationProps) {
  const pages = Math.max(1, pageCount)
  const current = Math.min(Math.max(0, page), pages - 1)

  if (hideWhenSingle && pages <= 1) return null

  const canPrev = current > 0
  const canNext = current < pages - 1

  return (
    <div
      role="navigation"
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        color: 'var(--text-muted)',
        ...style,
      }}
    >
      <ArrowButton dir="left" disabled={!canPrev} onClick={() => canPrev && onPageChange(current - 1)} />
      <span style={{ font: '500 var(--text-sm)/1 var(--font-body)' }}>
        {current + 1} of {pages}
      </span>
      <ArrowButton dir="right" disabled={!canNext} onClick={() => canNext && onPageChange(current + 1)} />
    </div>
  )
}

function ArrowButton({
  dir,
  disabled,
  onClick,
}: {
  dir: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={dir === 'left' ? 'Previous page' : 'Next page'}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        color: disabled ? 'var(--text-muted)' : 'var(--text-strong)',
        transition: 'opacity var(--dur-fast) var(--ease-standard)',
      }}
    >
      <Icon name={dir === 'left' ? 'arrow-left' : 'arrow-right'} size={16} color="currentColor" />
    </button>
  )
}
