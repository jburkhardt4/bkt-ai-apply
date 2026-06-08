/**
 * ProspectorSearchResults
 *
 * Dual-subtree responsive table/card list for prospector-discovered jobs.
 *   - Desktop (>= md): data-driven <table> with sort, per-column filter, row dismiss,
 *                      drag-and-drop column reorder (native HTML5 DnD),
 *                      keyboard-accessible column reorder (ArrowLeft / ArrowRight),
 *                      and localStorage-persisted column order.
 *   - Mobile  (< md):  stacked <ul> card list with global text filter and row dismiss.
 *                      Column order does not affect mobile; "Match Score" label is
 *                      consistent across both layouts.
 *
 * Column reorder — desktop only:
 *   - DnD: draggable <th> + onDragStart / onDragOver / onDrop / onDragEnd
 *   - Keyboard: focus a sortable header button → ArrowLeft / ArrowRight to reorder.
 *     Enter / Space continues to trigger sort (existing behaviour).
 *   - Action columns (Link, Dismiss) are pinned at the end and are NOT draggable.
 *   - Order persists via localStorage key "prospector_column_order_v1" with safe fallback.
 *
 * Design tokens enforced:
 *   - No arbitrary Tailwind values (no text-[14px], w-[...], etc.)
 *   - cursor-grab on draggable header hover; cursor-grabbing during drag (set on <thead>)
 *   - Dragged column ghost at reduced opacity (opacity-40 scale-95)
 *   - Drop-target indicator via injected CSS (box-shadow inset on primary colour)
 *   - Snap animation: 120ms ease-out opacity fade (CSS keyframe, no JS)
 *   - prefers-reduced-motion guard on all keyframe animations
 *   - Hardware-accelerated transitions: transform + opacity only
 *   - Durations <= 280ms; ease-out via cubic-bezier(0.23, 1, 0.32, 1)
 *   - Keyboard reorder does NOT animate (runs too frequently — per emil-design-eng)
 *   - aria-live region announces keyboard reorder moves
 *
 * Skills applied: design-taste-frontend, emil-design-eng
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink,
  Inbox,
  Briefcase,
  DollarSign,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  SlidersHorizontal,
  RotateCcw,
  GripVertical,
  LayoutList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'
import type { SortKey } from '../hooks/useProspectorTableControls'
import { useProspectorTableControls } from '../hooks/useProspectorTableControls'
import type { ColumnDef } from '../hooks/useProspectorColumnOrder'
import { useProspectorColumnOrder } from '../hooks/useProspectorColumnOrder'
import { ProspectorJobSheet } from './ProspectorJobSheet'
import {
  REMOTE_BADGE_CLASSES,
  formatCompensation,
  formatRelativeDate,
  formatJobType,
} from './prospectorJobFields'

// ── Props contract — DO NOT change ───────────────────────────────────────────

interface ProspectorSearchResultsProps {
  jobs: ProspectorSearchResult[]
  isLoading: boolean
}

// ── Scoped keyframe + DnD style injection ─────────────────────────────────────
// Injected once; prefers-reduced-motion guards all keyframe-driven motion.
// Drop indicator and column snap are implemented here (not as arbitrary Tailwind
// bracket values) so they can reference CSS custom properties from the design system.

function ProspectorRowStyles() {
  return (
    <style>{`
      /* ── Row enter animation ───────────────────────────────────────── */
      @keyframes prospector-row-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: no-preference) {
        .prospector-row-enter {
          animation: prospector-row-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
          animation-delay: var(--row-delay, 0ms);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .prospector-row-enter {
          animation: none;
          opacity: 1;
        }
      }

      /* ── Row dismiss: smooth max-h + opacity collapse ──────────────── */
      .prospector-row-dismiss {
        overflow: hidden;
        max-height: 60px;
        opacity: 1;
        transition:
          max-height 220ms cubic-bezier(0.23, 1, 0.32, 1),
          opacity    160ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .prospector-row-dismiss.dismissed {
        max-height: 0;
        opacity: 0;
      }

      /* ── Filter row: smooth expand/collapse ────────────────────────── */
      .prospector-filter-row {
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition:
          max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
          opacity    150ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .prospector-filter-row.open {
        max-height: 48px;
        opacity: 1;
      }

      /* ── Undo banner: slide down then fade ─────────────────────────── */
      @keyframes prospector-undo-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: no-preference) {
        .prospector-undo-banner {
          animation: prospector-undo-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
      }

      /* ── Column snap: 120ms ease-out opacity fade after drop ───────── */
      @keyframes prospector-col-snap {
        from { opacity: 0.55; }
        to   { opacity: 1; }
      }
      @media (prefers-reduced-motion: no-preference) {
        .prospector-col-snap {
          animation: prospector-col-snap 120ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
      }

      /* ── DnD: dragged column ghost ─────────────────────────────────── */
      .prospector-th-dragging {
        opacity: 0.4;
        transform: scale(0.95);
        transition: opacity 120ms ease-out, transform 120ms ease-out;
      }

      /* ── DnD: drop-target indicator (left and right variants) ──────── */
      /* Uses box-shadow inset with the design system's --primary HSL value.   */
      /* This avoids arbitrary Tailwind bracket syntax.                        */
      .prospector-drop-left {
        box-shadow: inset 2px 0 0 hsl(var(--primary));
      }
      .prospector-drop-right {
        box-shadow: inset -2px 0 0 hsl(var(--primary));
      }

      /* ── Drag cursor: set on <thead> during drag so cursor persists ── */
      .prospector-thead-dragging {
        cursor: grabbing !important;
      }
      .prospector-thead-dragging * {
        cursor: grabbing !important;
      }

      /* ── Draggable header: grab cursor on hover (pointer devices) ──── */
      @media (hover: hover) and (pointer: fine) {
        .prospector-th-draggable:hover {
          cursor: grab;
        }
      }
    `}</style>
  )
}

// ── Null cell placeholder ─────────────────────────────────────────────────────

function NullCell({ label = '—' }: { label?: string }) {
  return (
    <span className="select-none text-muted-foreground/40">{label}</span>
  )
}

// ── Environment badge ─────────────────────────────────────────────────────────

function RemoteBadge({ type }: { type: string | null }) {
  if (!type) return <NullCell />
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        REMOTE_BADGE_CLASSES[type] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

// ── Match score pill ──────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <NullCell />
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
      {Math.round(score)}
    </span>
  )
}

// ── Sort chevron ──────────────────────────────────────────────────────────────

interface SortChevronProps {
  active: boolean
  dir: 'asc' | 'desc'
}

function SortChevron({ active, dir }: SortChevronProps) {
  if (!active) {
    return (
      <ChevronsUpDown className="ml-1 inline h-3 w-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-40" />
    )
  }
  return dir === 'asc' ? (
    <ChevronUp className="ml-1 inline h-3 w-3 shrink-0 text-foreground" />
  ) : (
    <ChevronDown className="ml-1 inline h-3 w-3 shrink-0 text-foreground" />
  )
}

// ── Undo banner ───────────────────────────────────────────────────────────────

interface UndoBannerProps {
  title: string
  onUndo: () => void
  onDismiss: () => void
}

function UndoBanner({ title, onUndo, onDismiss }: UndoBannerProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div
      className={cn(
        'prospector-undo-banner',
        'mb-3 flex items-center justify-between gap-3',
        'rounded-md border border-border bg-muted/60 px-3 py-2',
        'text-sm text-foreground',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="truncate">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground"> hidden</span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={cn(
            'text-xs font-semibold text-foreground underline-offset-2',
            'hover:underline',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
          onClick={onUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className={cn(
            'text-muted-foreground',
            'hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Table loading skeletons ───────────────────────────────────────────────────

function TableLoadingSkeletons() {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      <colgroup>
        <col className="w-1/4" />
        <col className="w-1/6" />
        <col className="w-1/12" />
        <col className="w-1/12" />
        <col className="w-1/12" />
        <col className="w-1/6" />
        <col className="w-1/12" />
        <col className="w-1/12" />
        <col className="w-9" />
        <col className="w-9" />
      </colgroup>
      <thead>
        <tr>
          {[80, 60, 48, 48, 48, 60, 44, 44, 28, 28].map((w, i) => (
            <th key={i} className="px-3 pb-2 pt-1">
              <Skeleton className="h-3" style={{ width: `${w}%` }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...Array(4)].map((_, row) => (
          <tr key={row}>
            {/* Job Title */}
            <td className="px-3 py-3">
              <Skeleton className="h-4 w-4/5" />
            </td>
            {/* Company */}
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-3/4" />
            </td>
            {/* Match Score */}
            <td className="px-3 py-3">
              <Skeleton className="h-5 w-10 rounded-full" />
            </td>
            {/* Job Type */}
            <td className="px-3 py-3">
              <Skeleton className="h-5 w-14 rounded-full" />
            </td>
            {/* Environment */}
            <td className="px-3 py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </td>
            {/* Salary */}
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-4/5" />
            </td>
            {/* Date Posted */}
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-3/5" />
            </td>
            {/* Date Created */}
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-3/5" />
            </td>
            {/* Link */}
            <td className="px-3 py-3">
              <Skeleton className="h-7 w-7 rounded-md" />
            </td>
            {/* Dismiss */}
            <td className="px-3 py-3">
              <Skeleton className="h-7 w-7 rounded-md" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Mobile loading skeletons ──────────────────────────────────────────────────

function MobileLoadingSkeletons() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-3 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-56" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        No results yet. Run a search to discover new jobs.
      </p>
    </div>
  )
}

// ── Filter-empty state ────────────────────────────────────────────────────────

interface FilterEmptyStateProps {
  onClearFilters: () => void
}

function FilterEmptyState({ onClearFilters }: FilterEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <SlidersHorizontal className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        No jobs match your filters.
      </p>
      <button
        type="button"
        className={cn(
          'text-sm font-medium text-foreground underline-offset-2 hover:underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
        onClick={onClearFilters}
      >
        Clear all filters
      </button>
    </div>
  )
}

// ── Dismiss button ────────────────────────────────────────────────────────────

interface DismissButtonProps {
  label: string
  onClick: (e: React.MouseEvent) => void
  alwaysVisible?: boolean
}

function DismissButton({ label, onClick, alwaysVisible = false }: DismissButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center',
        'rounded-md border border-input bg-background',
        'text-muted-foreground',
        'transition-all duration-150',
        'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        alwaysVisible
          ? 'opacity-100'
          : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100',
      )}
      aria-label={label}
      onClick={onClick}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

// ── Animated table row wrapper ────────────────────────────────────────────────

interface AnimatedTableRowProps {
  jobId: string
  dismissed: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  role?: string
  tabIndex?: number
  'aria-label'?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLTableRowElement>
}

function AnimatedTableRow({
  dismissed,
  children,
  className,
  style,
  onClick,
  role,
  tabIndex,
  'aria-label': ariaLabel,
  onKeyDown,
}: AnimatedTableRowProps) {
  return (
    <tr
      className={cn('prospector-row-dismiss', dismissed && 'dismissed', className)}
      style={style}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      aria-hidden={dismissed}
    >
      {children}
    </tr>
  )
}

// ── Cell renderer — dispatches to the right markup per column ─────────────────

interface CellProps {
  col: ColumnDef
  job: ProspectorSearchResult
}

function JobCell({ col, job }: CellProps) {
  const tdClass = cn('px-3 py-3', col.minWidthClass)

  switch (col.id) {
    case 'title':
      return (
        <td className={tdClass}>
          <span className="block truncate text-sm font-medium text-foreground">
            {job.title}
          </span>
        </td>
      )
    case 'company':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap text-sm text-muted-foreground')}>
          {job.company_name ?? <NullCell />}
        </td>
      )
    case 'jobType':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap text-sm text-muted-foreground')}>
          {formatJobType(job.job_type) ?? <NullCell />}
        </td>
      )
    case 'environment':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap')}>
          <RemoteBadge type={job.remote_type} />
        </td>
      )
    case 'salary':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap text-sm text-muted-foreground')}>
          {formatCompensation(job.compensation_min, job.compensation_max) ?? (
            <NullCell label="Not Disclosed" />
          )}
        </td>
      )
    case 'posted':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap text-sm text-muted-foreground')}>
          {formatRelativeDate(job.posted_at)}
        </td>
      )
    case 'dateCreated':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap text-sm text-muted-foreground')}>
          {formatRelativeDate(job.created_at)}
        </td>
      )
    case 'matchScore':
      return (
        <td className={cn(tdClass, 'whitespace-nowrap')}>
          <ScorePill score={job.match_score} />
        </td>
      )
    default:
      return <td className={tdClass} />
  }
}

// ── Desktop table row (data-driven) ──────────────────────────────────────────

interface JobTableRowProps {
  job: ProspectorSearchResult
  index: number
  orderedColumns: ColumnDef[]
  onSelect: (job: ProspectorSearchResult) => void
  onDismiss: (id: string, title: string) => void
}

function JobTableRow({ job, index, orderedColumns, onSelect, onDismiss }: JobTableRowProps) {
  const [localDismissed, setLocalDismissed] = useState(false)

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    setLocalDismissed(true)
    setTimeout(() => onDismiss(job.id, job.title), 240)
  }

  return (
    <AnimatedTableRow
      jobId={job.id}
      dismissed={localDismissed}
      className={cn(
        'prospector-row-enter group cursor-pointer',
        'transition-colors duration-150',
        'hover:bg-muted/40',
        'active:bg-muted/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
      style={{ '--row-delay': `${index * 40}ms` } as React.CSSProperties}
      onClick={() => onSelect(job)}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(job)
        }
      }}
    >
      {orderedColumns.map((col) => (
        <JobCell key={col.id} col={col} job={job} />
      ))}

      {/* Link — pinned action column */}
      <td className="px-3 py-3">
        <a
          href={job.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center',
            'rounded-md border border-input bg-background',
            'text-muted-foreground',
            'transition-colors duration-150',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
          aria-label={`Open listing for ${job.title} in new tab`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </td>

      {/* Dismiss — pinned action column */}
      <td className="px-3 py-3">
        <DismissButton
          label={`Hide ${job.title}`}
          onClick={handleDismiss}
        />
      </td>
    </AnimatedTableRow>
  )
}

// ── Draggable sortable header cell ────────────────────────────────────────────
// Combines sort (click / Enter / Space) with column reorder (drag / ArrowLeft / ArrowRight).
// Keyboard reorder does NOT animate — per emil-design-eng, actions run many times per session
// should never be animated.

interface DraggableSortableHeaderProps {
  col: ColumnDef
  colIndex: number
  totalCols: number
  activeKey: SortKey | null
  activeDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  onMoveColumn: (fromIndex: number, toIndex: number) => void
  // DnD shared state passed down from parent (stored in refs — not state)
  dragState: React.MutableRefObject<DragState>
  onDragStartCol: (e: React.DragEvent<HTMLTableCellElement>, index: number) => void
  onDragOverCol: (e: React.DragEvent<HTMLTableCellElement>, index: number) => void
  onDropCol: (e: React.DragEvent<HTMLTableCellElement>, index: number) => void
  onDragEndCol: () => void
  dropIndicator: DropIndicator | null
  // For aria-live announcement
  onAnnounce: (msg: string) => void
}

interface DragState {
  dragging: boolean
  sourceIndex: number | null
}

type DropSide = 'left' | 'right'

interface DropIndicator {
  index: number
  side: DropSide
}

function DraggableSortableHeader({
  col,
  colIndex,
  totalCols,
  activeKey,
  activeDir,
  onSort,
  onMoveColumn,
  dragState,
  onDragStartCol,
  onDragOverCol,
  onDropCol,
  onDragEndCol,
  dropIndicator,
  onAnnounce,
}: DraggableSortableHeaderProps) {
  const isActive = col.sortKey ? activeKey === col.sortKey : false
  const isDragging =
    dragState.current.dragging && dragState.current.sourceIndex === colIndex
  const isDropLeft =
    dropIndicator?.index === colIndex && dropIndicator.side === 'left'
  const isDropRight =
    dropIndicator?.index === colIndex && dropIndicator.side === 'right'

  // Keyboard reorder: ArrowLeft / ArrowRight. No animation (runs too frequently).
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (colIndex > 0) {
        onMoveColumn(colIndex, colIndex - 1)
        onAnnounce(
          `${col.label} moved to position ${colIndex} of ${totalCols}`,
        )
      }
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (colIndex < totalCols - 1) {
        onMoveColumn(colIndex, colIndex + 1)
        onAnnounce(
          `${col.label} moved to position ${colIndex + 2} of ${totalCols}`,
        )
      }
      return
    }
    // Enter / Space → sort (existing behaviour)
    if ((e.key === 'Enter' || e.key === ' ') && col.sortKey) {
      e.preventDefault()
      onSort(col.sortKey)
    }
  }

  const ariaLabel = col.sortKey
    ? `Sort by ${col.label}${isActive ? `, currently ${activeDir}ending` : ''}. Column ${colIndex + 1} of ${totalCols}. Press left or right arrow to reorder.`
    : `${col.label}. Column ${colIndex + 1} of ${totalCols}. Press left or right arrow to reorder.`

  return (
    <th
      scope="col"
      className={cn(
        'px-3 pb-2 pt-1 text-left',
        'prospector-th-draggable',
        col.minWidthClass,
        isDragging && 'prospector-th-dragging',
        isDropLeft && 'prospector-drop-left',
        isDropRight && 'prospector-drop-right',
      )}
      draggable
      onDragStart={(e) => onDragStartCol(e, colIndex)}
      onDragOver={(e) => onDragOverCol(e, colIndex)}
      onDrop={(e) => onDropCol(e, colIndex)}
      onDragEnd={onDragEndCol}
    >
      <button
        type="button"
        className={cn(
          'group inline-flex items-center',
          'text-sm font-semibold uppercase tracking-wide text-foreground',
          'transition-all duration-150',
          'active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded',
          'select-none',
        )}
        onClick={() => col.sortKey && onSort(col.sortKey)}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      >
        {/* Drag handle — decorative, hidden on reduced-motion */}
        <GripVertical
          className={cn(
            'mr-1 h-3 w-3 shrink-0 text-muted-foreground',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-50',
          )}
          aria-hidden
        />
        {col.label}
        {col.sortKey && (
          <SortChevron active={isActive} dir={activeDir} />
        )}
      </button>
    </th>
  )
}

// ── Non-sortable pinned header (Link / Dismiss) ───────────────────────────────

function PinnedActionHeader() {
  return <th scope="col" className="px-3 pb-2 pt-1 w-9" />
}

// ── Filter cell dispatcher ────────────────────────────────────────────────────
// Renders the correct filter control for a given column's filterType.

interface FilterCellProps {
  col: ColumnDef
  controls: ReturnType<typeof useProspectorTableControls>
  jobTypeOptions: { value: string; label: string }[]
}

const ENVIRONMENT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

function FilterCell({ col, controls, jobTypeOptions }: FilterCellProps) {
  switch (col.filterType) {
    case 'text': {
      const field = col.id === 'title' ? 'title' : 'company'
      const placeholder = col.id === 'title' ? 'Title...' : 'Company...'
      const ariaLabel = col.id === 'title' ? 'Filter by job title' : 'Filter by company'
      return (
        <td className={cn('px-2 py-1', col.minWidthClass)}>
          <div className="relative">
            <input
              type="text"
              value={controls.filters[field]}
              placeholder={placeholder}
              aria-label={ariaLabel}
              onChange={(e) => controls.setFilter(field, e.target.value)}
              className={cn(
                'w-full rounded border px-2 py-1 text-xs',
                'border-input bg-background text-foreground placeholder:text-muted-foreground/50',
                'transition-colors duration-150',
                'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
                controls.filters[field] && 'border-primary/60',
              )}
            />
            {controls.filters[field] && (
              <button
                type="button"
                aria-label={`Clear ${ariaLabel} filter`}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => controls.setFilter(field, '')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </td>
      )
    }

    case 'select': {
      const isJobType = col.id === 'jobType'
      const field = isJobType ? 'jobType' : 'environment'
      const options = isJobType ? jobTypeOptions : ENVIRONMENT_OPTIONS
      const ariaLabel = isJobType ? 'Filter by job type' : 'Filter by work environment'
      return (
        <td className={cn('px-2 py-1', col.minWidthClass)}>
          <select
            value={controls.filters[field]}
            aria-label={ariaLabel}
            onChange={(e) => controls.setFilter(field, e.target.value)}
            className={cn(
              'w-full rounded border px-2 py-1 text-xs',
              'border-input bg-background text-foreground',
              'transition-colors duration-150',
              'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
              controls.filters[field] && 'border-primary/60',
            )}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
      )
    }

    case 'salary-range':
      return (
        <td className="px-2 py-1">
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={controls.filters.salaryMin}
              placeholder="Min"
              aria-label="Minimum salary filter"
              onChange={(e) => controls.setFilter('salaryMin', e.target.value)}
              className={cn(
                'w-full min-w-0 rounded border px-2 py-1 text-xs',
                'border-input bg-background text-foreground placeholder:text-muted-foreground/50',
                'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
                controls.filters.salaryMin && 'border-primary/60',
              )}
            />
            <span className="shrink-0 text-xs text-muted-foreground/50">–</span>
            <input
              type="number"
              value={controls.filters.salaryMax}
              placeholder="Max"
              aria-label="Maximum salary filter"
              onChange={(e) => controls.setFilter('salaryMax', e.target.value)}
              className={cn(
                'w-full min-w-0 rounded border px-2 py-1 text-xs',
                'border-input bg-background text-foreground placeholder:text-muted-foreground/50',
                'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
                controls.filters.salaryMax && 'border-primary/60',
              )}
            />
          </div>
        </td>
      )

    case 'score':
      return (
        <td className="px-2 py-1">
          <input
            type="number"
            value={controls.filters.scoreMin}
            placeholder="Min"
            aria-label="Minimum match score filter"
            onChange={(e) => controls.setFilter('scoreMin', e.target.value)}
            className={cn(
              'w-full min-w-0 rounded border px-2 py-1 text-xs',
              'border-input bg-background text-foreground placeholder:text-muted-foreground/50',
              'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
              controls.filters.scoreMin && 'border-primary/60',
            )}
          />
        </td>
      )

    case 'none':
    default:
      return <td className={cn('px-2 py-1', col.minWidthClass)} />
  }
}

// ── Mobile job card ───────────────────────────────────────────────────────────

interface JobCardProps {
  job: ProspectorSearchResult
  index: number
  onSelect: (job: ProspectorSearchResult) => void
  onDismiss: (id: string, title: string) => void
}

function JobCard({ job, index, onSelect, onDismiss }: JobCardProps) {
  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)
  const jobTypeLabel = formatJobType(job.job_type)
  const [localDismissed, setLocalDismissed] = useState(false)
  const dismissRef = useRef<HTMLLIElement>(null)

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    setLocalDismissed(true)
    setTimeout(() => onDismiss(job.id, job.title), 240)
  }

  return (
    <li
      ref={dismissRef}
      className={cn(
        'prospector-row-enter prospector-row-dismiss group relative',
        localDismissed && 'dismissed',
      )}
      style={{ '--row-delay': `${index * 40}ms` } as React.CSSProperties}
      aria-hidden={localDismissed}
    >
      <button
        type="button"
        className={cn(
          'w-full rounded-lg px-3 py-3 text-left',
          'transition duration-150',
          'hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'active:scale-95',
          'pr-20',
        )}
        onClick={() => onSelect(job)}
        aria-label={`View details for ${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`}
      >
        <p className="truncate text-sm font-medium leading-snug text-foreground">
          {job.title}
        </p>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {job.company_name ? (
            <span className="truncate text-xs text-muted-foreground">
              {job.company_name}
            </span>
          ) : (
            <span className="select-none text-xs text-muted-foreground/40">—</span>
          )}
          {comp ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/60">
              <DollarSign className="h-3 w-3 shrink-0" />
              {comp}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/40">
              <DollarSign className="h-3 w-3 shrink-0" />
              Not Disclosed
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
            <Calendar className="h-3 w-3 shrink-0" />
            {dateLabel}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {job.remote_type ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                REMOTE_BADGE_CLASSES[job.remote_type] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {job.remote_type.charAt(0).toUpperCase() + job.remote_type.slice(1)}
            </span>
          ) : null}
          {jobTypeLabel && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              {jobTypeLabel}
            </span>
          )}
          {/* Mobile: "Match Score" label consistent with desktop header (AC §3) */}
          {job.match_score !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              Match Score {Math.round(job.match_score)}
            </span>
          )}
        </div>
      </button>

      <a
        href={job.source_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute right-10 top-1/2 -translate-y-1/2',
          'inline-flex h-7 w-7 items-center justify-center',
          'rounded-md border border-input bg-background',
          'text-muted-foreground',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'group-focus-within:opacity-100',
        )}
        aria-label={`Open listing for ${job.title} in new tab`}
        tabIndex={0}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <DismissButton
          label={`Hide ${job.title}`}
          onClick={handleDismiss}
          alwaysVisible
        />
      </div>
    </li>
  )
}

// ── Mobile global text filter ─────────────────────────────────────────────────

interface MobileFilterBarProps {
  value: string
  onChange: (v: string) => void
}

function MobileFilterBar({ value, onChange }: MobileFilterBarProps) {
  return (
    <div className="relative mb-3">
      <input
        type="search"
        value={value}
        placeholder="Filter by title or company..."
        aria-label="Filter jobs by title or company"
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-md border px-3 py-2 text-sm',
          'border-input bg-background text-foreground placeholder:text-muted-foreground/50',
          'transition-colors duration-150',
          'focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
          value && 'border-primary/60',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => onChange('')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ── Job Type option builder ───────────────────────────────────────────────────

function buildJobTypeOptions(jobs: ProspectorSearchResult[]) {
  const seen = new Set<string>()
  const options: { value: string; label: string }[] = [{ value: '', label: 'All types' }]
  for (const j of jobs) {
    if (j.job_type && !seen.has(j.job_type)) {
      seen.add(j.job_type)
      const label = j.job_type.charAt(0).toUpperCase() + j.job_type.slice(1)
      options.push({ value: j.job_type, label })
    }
  }
  return options
}

// ── Desktop column reorder hook (DnD state, local to this component) ──────────
// dragState lives in a ref (not state) — it must not trigger re-renders during drag.
// dropIndicator IS state because it drives the visual drop-target indicator.

function useColumnDnD(
  orderedColumns: ColumnDef[],
  moveColumn: (from: number, to: number) => void,
) {
  const dragState = useRef<DragState>({ dragging: false, sourceIndex: null })
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [isThDragging, setIsThDragging] = useState(false)
  // Track which column indices have the snap class applied post-drop
  const [snappingCols, setSnappingCols] = useState<Set<number>>(new Set())

  const onDragStartCol = useCallback(
    (e: React.DragEvent<HTMLTableCellElement>, index: number) => {
      dragState.current = { dragging: true, sourceIndex: index }
      setIsThDragging(true)
      // Required for a valid HTML5 drag across browsers — Firefox will not fire
      // drop without dataTransfer data; 'move' yields the correct drop cursor.
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    [],
  )

  const onDragOverCol = useCallback(
    (e: React.DragEvent<HTMLTableCellElement>, index: number) => {
      e.preventDefault() // required to allow drop
      e.dataTransfer.dropEffect = 'move'
      const source = dragState.current.sourceIndex
      if (source === null || source === index) {
        setDropIndicator(null)
        return
      }
      // Determine left vs right side based on pointer position within the <th>
      const rect = e.currentTarget.getBoundingClientRect()
      const midX = rect.left + rect.width / 2
      const side: DropSide = e.clientX < midX ? 'left' : 'right'
      setDropIndicator({ index, side })
    },
    [],
  )

  const onDropCol = useCallback(
    (e: React.DragEvent<HTMLTableCellElement>, targetIndex: number) => {
      e.preventDefault()
      const sourceIndex = dragState.current.sourceIndex
      if (sourceIndex === null || sourceIndex === targetIndex) {
        setDropIndicator(null)
        setIsThDragging(false)
        dragState.current = { dragging: false, sourceIndex: null }
        return
      }

      // moveColumn(source, target) performs a splice: remove from source, insert at target.
      // The reducer handles both left-to-right and right-to-left moves correctly.
      // We use targetIndex directly — the drop-side indicator is visual feedback only;
      // the reducer's splice semantics produce the correct final order in both directions.
      moveColumn(sourceIndex, targetIndex)

      // Apply snap animation to the columns that shifted
      const newSnapping = new Set<number>()
      const len = orderedColumns.length
      for (let i = 0; i < len; i++) newSnapping.add(i)
      setSnappingCols(newSnapping)
      setTimeout(() => setSnappingCols(new Set()), 200)

      setDropIndicator(null)
      setIsThDragging(false)
      dragState.current = { dragging: false, sourceIndex: null }
    },
    [moveColumn, orderedColumns.length],
  )

  const onDragEndCol = useCallback(() => {
    // Fires if drop occurred outside a valid target (e.g. outside the table)
    dragState.current = { dragging: false, sourceIndex: null }
    setDropIndicator(null)
    setIsThDragging(false)
  }, [])

  return {
    dragState,
    dropIndicator,
    isThDragging,
    snappingCols,
    onDragStartCol,
    onDragOverCol,
    onDropCol,
    onDragEndCol,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ProspectorSearchResults({ jobs, isLoading }: ProspectorSearchResultsProps) {
  const [selectedJob, setSelectedJob] = useState<ProspectorSearchResult | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // aria-live region content for keyboard reorder announcements
  const [announcement, setAnnouncement] = useState('')

  const controls = useProspectorTableControls(jobs)
  const columnOrder = useProspectorColumnOrder()

  const dnd = useColumnDnD(columnOrder.orderedColumns, columnOrder.moveColumn)

  const mobileFilterValue = controls.filters.title

  function handleSelectJob(job: ProspectorSearchResult) {
    setSelectedJob(job)
    setSheetOpen(true)
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      setTimeout(() => setSelectedJob(null), 350)
    }
  }

  const handleAnnounce = useCallback((msg: string) => {
    setAnnouncement(msg)
    // Clear after screen reader has had time to read it
    setTimeout(() => setAnnouncement(''), 1500)
  }, [])

  const jobTypeOptions = buildJobTypeOptions(jobs)

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <div className="hidden overflow-x-auto md:block">
          <TableLoadingSkeletons />
        </div>
        <div className="md:hidden">
          <MobileLoadingSkeletons />
        </div>
      </>
    )
  }

  // ── Empty (no jobs at all) ───────────────────────────────────────────────

  if (jobs.length === 0) {
    return <EmptyState />
  }

  const hiddenCount = controls.hiddenIds.size
  const totalVisible = controls.displayJobs.length
  const filterEmptyState = totalVisible === 0 && (controls.hasActiveFilters || hiddenCount > 0)
  const totalDataCols = columnOrder.orderedColumns.length

  // ── Populated ────────────────────────────────────────────────────────────

  return (
    <>
      <ProspectorRowStyles />

      {/* aria-live region for keyboard reorder announcements — visually hidden */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Undo banner */}
      {controls.undoTarget && (
        <UndoBanner
          title={controls.undoTarget.title}
          onUndo={controls.undoDismiss}
          onDismiss={controls.clearUndoTarget}
        />
      )}

      {/* Count + filter/reset toolbar row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            {totalVisible} {totalVisible === 1 ? 'job' : 'jobs'}
            {controls.hasActiveFilters && ' (filtered)'}
          </p>
          {hiddenCount > 0 && (
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                'text-xs text-muted-foreground',
                'hover:text-foreground hover:bg-muted/60',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
              onClick={controls.restoreAll}
              aria-label={`Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'job' : 'jobs'}`}
            >
              <RotateCcw className="h-3 w-3" />
              Show hidden ({hiddenCount})
            </button>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {/* Reset column order — visible only when order differs from default */}
          {columnOrder.isNonDefaultOrder && (
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2 py-1',
                'text-xs font-medium text-muted-foreground',
                'border border-input bg-background',
                'hover:bg-muted/60 hover:text-foreground',
                'transition-all duration-150',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
              onClick={columnOrder.resetOrder}
              aria-label="Reset column order to default"
            >
              <LayoutList className="h-3.5 w-3.5" />
              Reset order
            </button>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2 py-1',
              'text-xs font-medium text-muted-foreground',
              'border border-input bg-background',
              'hover:bg-muted/60 hover:text-foreground',
              'transition-all duration-150',
              'active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              controls.filterRowOpen && 'bg-muted/60 text-foreground',
              controls.hasActiveFilters && 'border-primary/60 text-foreground',
            )}
            onClick={controls.toggleFilterRow}
            aria-expanded={controls.filterRowOpen}
            aria-label={controls.filterRowOpen ? 'Hide column filters' : 'Show column filters'}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {controls.hasActiveFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {Object.values(controls.filters).filter((v) => v !== '').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Desktop: structured data table (>= md) ────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-separate border-spacing-0">
          {/* colgroup: drives proportional column widths */}
          <colgroup>
            {columnOrder.orderedColumns.map((col) => (
              <col key={col.id} className={col.widthClass} />
            ))}
            {/* Pinned action columns */}
            <col className="w-9" />
            <col className="w-9" />
          </colgroup>

          <thead
            className={cn(
              'sticky top-0 z-10 bg-background/95 backdrop-blur-sm',
              dnd.isThDragging && 'prospector-thead-dragging',
            )}
          >
            {/* Header row — data-driven */}
            <tr className="border-b border-border">
              {columnOrder.orderedColumns.map((col, i) => (
                <DraggableSortableHeader
                  key={col.id}
                  col={col}
                  colIndex={i}
                  totalCols={totalDataCols}
                  activeKey={controls.sort.key}
                  activeDir={controls.sort.dir}
                  onSort={controls.setSort}
                  onMoveColumn={columnOrder.moveColumn}
                  dragState={dnd.dragState}
                  onDragStartCol={dnd.onDragStartCol}
                  onDragOverCol={dnd.onDragOverCol}
                  onDropCol={dnd.onDropCol}
                  onDragEndCol={dnd.onDragEndCol}
                  dropIndicator={dnd.dropIndicator}
                  onAnnounce={handleAnnounce}
                />
              ))}
              <PinnedActionHeader />
              <PinnedActionHeader />
            </tr>

            {/* Filter row — expands/collapses via CSS transition */}
            <tr
              className={cn(
                'prospector-filter-row border-b border-border',
                controls.filterRowOpen && 'open',
              )}
              aria-hidden={!controls.filterRowOpen}
            >
              {columnOrder.orderedColumns.map((col) => (
                <FilterCell
                  key={col.id}
                  col={col}
                  controls={controls}
                  jobTypeOptions={jobTypeOptions}
                />
              ))}
              {/* Pinned action columns — no filter */}
              <td />
              <td />
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {filterEmptyState ? (
              <tr>
                <td colSpan={totalDataCols + 2}>
                  <FilterEmptyState onClearFilters={controls.clearFilters} />
                </td>
              </tr>
            ) : (
              controls.displayJobs.map((job, index) => (
                <JobTableRow
                  key={job.id}
                  job={job}
                  index={index}
                  orderedColumns={columnOrder.orderedColumns}
                  onSelect={handleSelectJob}
                  onDismiss={controls.dismissJob}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked card list (< md) ─────────────────────────────── */}
      <div className="md:hidden">
        <MobileFilterBar
          value={mobileFilterValue}
          onChange={(v) => controls.setFilter('title', v)}
        />

        {filterEmptyState ? (
          <FilterEmptyState onClearFilters={controls.clearFilters} />
        ) : (
          <ul className="divide-y divide-border">
            {controls.displayJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                index={index}
                onSelect={handleSelectJob}
                onDismiss={controls.dismissJob}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Slide-out detail sheet — shared by both views */}
      <ProspectorJobSheet
        job={selectedJob}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
      />
    </>
  )
}
