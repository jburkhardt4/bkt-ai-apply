import { useState } from 'react'
import { ExternalLink, Inbox, MapPin, Briefcase, DollarSign, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'
import { ProspectorJobSheet } from './ProspectorJobSheet'
import {
  REMOTE_BADGE_CLASSES,
  formatCompensation,
  formatRelativeDate,
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

// ── Environment badge ─────────────────────────────────────────────────────────

function RemoteBadge({ type }: { type: string | null }) {
  if (!type) return null
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

// ── Job Type badge ────────────────────────────────────────────────────────────

function JobTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Briefcase className="h-3 w-3 shrink-0" />
      {type}
    </span>
  )
}

// ── Skeleton loading state ────────────────────────────────────────────────────

function LoadingSkeletons() {
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

// ── Individual job row ────────────────────────────────────────────────────────
// Rendered as a real <button> so Enter/Space triggers the sheet.
// The external-link <a> uses stopPropagation to prevent also opening the sheet.

interface JobRowProps {
  job: ProspectorSearchResult
  index: number
  onSelect: (job: ProspectorSearchResult) => void
}

function JobRow({ job, index, onSelect }: JobRowProps) {
  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)

  return (
    <li
      className="prospector-row-enter group relative"
      style={{ '--row-delay': `${index * 40}ms` } as React.CSSProperties}
    >
      {/*
       * Full-row button — keyboard-accessible, focus-visible ring,
       * tactile scale-down on active (emil-design-eng tactile feedback).
       * `transition` (not transition-all) animates both hover bg and active scale.
       * Padding-right leaves room for the external-link icon.
       */}
      <button
        type="button"
        className={cn(
          'w-full rounded-lg px-3 py-3 text-left',
          'transition duration-150',
          'hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'active:scale-95',
          // Ensure the external-link icon (absolute-positioned inside) is not
          // clipped by the button's own transform
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
          {job.company_name && (
            <span className="truncate text-xs text-muted-foreground">
              {job.company_name}
            </span>
          )}
          {job.location && (
            <span className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {job.location}
            </span>
          )}
          {comp && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/60">
              <DollarSign className="h-3 w-3 shrink-0" />
              {comp}
            </span>
          )}
          {job.posted_at && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
              <Calendar className="h-3 w-3 shrink-0" />
              {dateLabel}
            </span>
          )}
        </div>

        {/* Badge row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <RemoteBadge type={job.remote_type} />
          <JobTypeBadge type={job.job_type} />
        </div>
      </button>

      {/*
       * Secondary quick-out affordance: opens source_url in a new tab
       * WITHOUT triggering the sheet (stopPropagation).
       * Absolutely positioned so it floats to the right of the row
       * without participating in the button's text layout.
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
          // Always visible on touch/keyboard — unhide when group is focused-within
          'group-focus-within:opacity-100',
        )}
        aria-label={`Open external listing for ${job.title} (opens in new tab)`}
        tabIndex={0}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </li>
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
    // Clear it only after the sheet is fully closed (open === false).
    // Small delay matches the sheet's 300ms close duration so the panel
    // doesn't blank out while sliding away.
    if (!open) {
      setTimeout(() => setSelectedJob(null), 350)
    }
  }

  if (isLoading) {
    return <LoadingSkeletons />
  }

  if (jobs.length === 0) {
    return <EmptyState />
  }

  return (
    <>
      <ProspectorRowStyles />

      <div className="space-y-1">
        {/* Count label */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} found
        </p>

        {/* Job list — divide-y for crisp separation without card boxing */}
        <ul className="divide-y divide-border">
          {jobs.map((job, index) => (
            <JobRow
              key={job.id}
              job={job}
              index={index}
              onSelect={handleSelectJob}
            />
          ))}
        </ul>
      </div>

      {/* Slide-out detail sheet */}
      <ProspectorJobSheet
        job={selectedJob}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
      />
    </>
  )
}
