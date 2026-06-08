import { useState } from 'react'
import { ExternalLink, Inbox, Briefcase, DollarSign, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'
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

// ── Scoped keyframe injection ─────────────────────────────────────────────────
// Injected once; gate on prefers-reduced-motion so motion-sensitive users
// receive a simple opacity fade without translateY movement.

function ProspectorRowStyles() {
  return (
    <style>{`
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
    `}</style>
  )
}

// ── Null cell placeholder ─────────────────────────────────────────────────────
// Visually recessed "—" for cells with no data. select-none prevents
// users accidentally selecting filler dashes when dragging across the table.

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

// ── Table loading skeletons ───────────────────────────────────────────────────
// Skeleton matches the 7-column table structure to prevent layout shift.

function TableLoadingSkeletons() {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      {/* Column proportions match the live table */}
      <colgroup>
        <col className="w-1/3" />
        <col className="w-1/6" />
        <col className="w-1/12" />
        <col className="w-1/12" />
        <col className="w-1/6" />
        <col className="w-1/12" />
        <col className="w-9" />
      </colgroup>
      <thead>
        <tr>
          {[80, 60, 48, 48, 52, 44, 28].map((w, i) => (
            <th key={i} className="px-3 pb-2 pt-1">
              <Skeleton className="h-3" style={{ width: `${w}%` }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...Array(4)].map((_, row) => (
          <tr key={row}>
            <td className="px-3 py-3">
              <Skeleton className="h-4 w-4/5" />
            </td>
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-3/4" />
            </td>
            <td className="px-3 py-3">
              <Skeleton className="h-5 w-14 rounded-full" />
            </td>
            <td className="px-3 py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </td>
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-4/5" />
            </td>
            <td className="px-3 py-3">
              <Skeleton className="h-3 w-4/5" />
            </td>
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

// ── Individual mobile job card ────────────────────────────────────────────────
// Preserved from the original stacked list layout — used on viewports < md.
// Rendered as a real <button> so Enter/Space triggers the sheet.

interface JobCardProps {
  job: ProspectorSearchResult
  index: number
  onSelect: (job: ProspectorSearchResult) => void
}

function JobCard({ job, index, onSelect }: JobCardProps) {
  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)
  const jobTypeLabel = formatJobType(job.job_type)

  return (
    <li
      className="prospector-row-enter group relative"
      style={{ '--row-delay': `${index * 40}ms` } as React.CSSProperties}
    >
      {/*
       * Full-row button — keyboard-accessible, focus-visible ring,
       * tactile scale-down on active (emil-design-eng tactile feedback).
       */}
      <button
        type="button"
        className={cn(
          'w-full rounded-lg px-3 py-3 text-left',
          'transition duration-150',
          'hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'active:scale-95',
          'pr-10',
        )}
        onClick={() => onSelect(job)}
        aria-label={`View details for ${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`}
      >
        {/* Title */}
        <p className="truncate text-sm font-medium leading-snug text-foreground">
          {job.title}
        </p>

        {/* Company + secondary metadata row */}
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

        {/* Badge row */}
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
        </div>
      </button>

      {/*
       * External-link icon button — opens source_url in a new tab
       * WITHOUT triggering the sheet (stopPropagation).
       */}
      <a
        href={job.source_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
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
    </li>
  )
}

// ── Desktop table row ─────────────────────────────────────────────────────────
// The <tr> itself receives onClick for the row-click-to-sheet affordance.
// The external-link <a> uses stopPropagation to stay independent.

interface JobTableRowProps {
  job: ProspectorSearchResult
  index: number
  onSelect: (job: ProspectorSearchResult) => void
}

function JobTableRow({ job, index, onSelect }: JobTableRowProps) {
  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)
  const jobTypeLabel = formatJobType(job.job_type)

  return (
    <tr
      className={cn(
        'prospector-row-enter group cursor-pointer',
        'border-b border-border',
        'transition-colors duration-150',
        'hover:bg-muted/40',
        'active:bg-muted/70',
        // focus-visible ring is inset so it does not affect neighbor rows
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
      style={{ '--row-delay': `${index * 40}ms` } as React.CSSProperties}
      onClick={() => onSelect(job)}
      // <tr> is not natively interactive — add role and keyboard support
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
      {/* Job Title */}
      <td className="px-3 py-3">
        <span className="block truncate text-sm font-medium text-foreground">
          {job.title}
        </span>
      </td>

      {/* Company */}
      <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
        {job.company_name ?? <NullCell />}
      </td>

      {/* Job Type */}
      <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
        {jobTypeLabel ?? <NullCell />}
      </td>

      {/* Environment */}
      <td className="whitespace-nowrap px-3 py-3">
        <RemoteBadge type={job.remote_type} />
      </td>

      {/* Salary */}
      <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
        {comp ?? <NullCell label="Not Disclosed" />}
      </td>

      {/* Date Posted */}
      <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
        {dateLabel}
      </td>

      {/* Job Link — always visible in the table; icon is the affordance */}
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
    </tr>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ProspectorSearchResults({ jobs, isLoading }: ProspectorSearchResultsProps) {
  const [selectedJob, setSelectedJob] = useState<ProspectorSearchResult | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  function handleSelectJob(job: ProspectorSearchResult) {
    setSelectedJob(job)
    setSheetOpen(true)
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    // Keep selectedJob alive while the sheet's close animation plays.
    // Clear only after the sheet is fully closed — small delay matches
    // the sheet's 300 ms close duration so the panel doesn't blank out
    // while sliding away.
    if (!open) {
      setTimeout(() => setSelectedJob(null), 350)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        {/* Desktop: table-shaped skeletons */}
        <div className="hidden overflow-x-auto md:block">
          <TableLoadingSkeletons />
        </div>
        {/* Mobile: stacked-card skeletons */}
        <div className="md:hidden">
          <MobileLoadingSkeletons />
        </div>
      </>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────────

  if (jobs.length === 0) {
    return <EmptyState />
  }

  // ── Populated ─────────────────────────────────────────────────────────────

  return (
    <>
      <ProspectorRowStyles />

      {/* Count label — shared by both desktop and mobile views */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} found
      </p>

      {/* ── Desktop: structured data table (>= md) ────────────────────────── */}
      {/*
       * hidden md:table — two completely separate subtrees rather than
       * responsive CSS hacks on <table> elements (unreliable cross-browser).
       * overflow-x-auto handles intermediate tablet-portrait viewports that
       * are too wide for the mobile list but too narrow for all columns.
       *
       * sticky thead technique:
       *   - table-fixed + border-separate border-spacing-0 keep the thead
       *     border from scrolling with the rows.
       *   - sticky top-0 z-10 keeps headers visible on long lists.
       *   - bg-background/95 backdrop-blur-sm gives a frosted-glass feel
       *     as rows scroll underneath — an invisible detail that reads as polish.
       */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-separate border-spacing-0">
          {/* Column proportions */}
          <colgroup>
            <col className="w-1/3" />
            <col className="w-1/6" />
            <col className="w-1/12" />
            <col className="w-1/12" />
            <col className="w-1/6" />
            <col className="w-1/12" />
            <col className="w-9" />
          </colgroup>

          {/*
           * Sticky header — bg + backdrop-blur applied directly on <thead>
           * so it covers the scrolling rows without a separate overlay div.
           */}
          <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <tr className="border-b border-border">
              {[
                'Job Title',
                'Company',
                'Job Type',
                'Environment',
                'Salary',
                'Date Posted',
                '',
              ].map((header, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    'px-3 pb-2 pt-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground/60',
                    // Last column (link icon) — no text, no padding needed
                    i === 6 && 'w-9',
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {jobs.map((job, index) => (
              <JobTableRow
                key={job.id}
                job={job}
                index={index}
                onSelect={handleSelectJob}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: stacked card list (< md) ─────────────────────────────── */}
      {/*
       * md:hidden — mirrors the original JobRow list pattern exactly.
       * No responsive hacks; just a separate, correct subtree for narrow
       * viewports. Reuses the same animation and badge primitives.
       */}
      <div className="md:hidden">
        <ul className="divide-y divide-border">
          {jobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              index={index}
              onSelect={handleSelectJob}
            />
          ))}
        </ul>
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
