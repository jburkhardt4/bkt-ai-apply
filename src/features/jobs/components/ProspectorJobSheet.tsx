import { useEffect, useState } from 'react'
import { ExternalLink, MapPin, Briefcase, DollarSign, Calendar, Sparkles } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'
import { formatJobDescription } from '../services/jdFormattingService'
import { CompanyLogo } from './CompanyLogo'
import { JobDescriptionMarkdown } from './JobDescriptionMarkdown'
import {
  REMOTE_BADGE_CLASSES,
  formatCompensation,
  formatRelativeDate,
  deriveSourceLabel,
} from './prospectorJobFields'

// ── Session-scoped cache ─────────────────────────────────────────────────────
// Memoizes the normalized JD per job id so re-opening the same row is instant
// and never re-bills the LLM. Lives at module scope (one entry per job, small).

interface FormattedJd {
  markdown: string
  source: 'llm' | 'fallback'
}

const formattedJdCache = new Map<string, FormattedJd>()

// ── Meta pill (icon + label) used inside the Sheet ───────────────────────────

interface MetaPillProps {
  icon: React.ReactNode
  label: string
  className?: string
}

function MetaPill({ icon, label, className }: MetaPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  )
}

// ── Loading skeleton shown while the JD is normalized by the LLM ─────────────

function JobDescriptionSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Formatting description">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
        Formatting description…
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-10/12 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-9/12 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProspectorJobSheetProps {
  job: ProspectorSearchResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProspectorJobSheet({ job, open, onOpenChange }: ProspectorJobSheetProps) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Async LLM-formatted JD result, keyed by jobId so a stale result for a
  // previously open job is never shown for the current one.
  const [asyncJd, setAsyncJd] = useState<{
    jobId: string
    markdown: string
    source: 'llm' | 'fallback'
  } | null>(null)

  const jobId = job?.id ?? null
  const raw = (job?.description ?? '').trim()
  const cached = jobId ? formattedJdCache.get(jobId) : undefined

  // Fetch the formatted JD when the sheet opens for a job that has a description,
  // isn't cached, and we have an authenticated user. The effect does NO synchronous
  // setState (display state is derived during render below, avoiding the cascading
  // re-renders flagged by react-hooks/set-state-in-effect); it records the async
  // result via setAsyncJd inside the promise callbacks only.
  useEffect(() => {
    if (!open || !job) return

    const rawDescription = (job.description ?? '').trim()
    if (rawDescription.length === 0) return
    if (formattedJdCache.get(job.id)) return
    // Without an authenticated user we can't call the JWT-gated function; the
    // render-time derivation falls back to the raw description.
    if (!userId) return

    let cancelled = false
    formatJobDescription({ userId, rawDescription })
      .then((result) => {
        if (cancelled) return
        formattedJdCache.set(job.id, result)
        setAsyncJd({ jobId: job.id, markdown: result.markdown, source: result.source })
      })
      .catch(() => {
        if (cancelled) return
        setAsyncJd({ jobId: job.id, markdown: rawDescription, source: 'fallback' })
      })

    return () => {
      cancelled = true
    }
  }, [open, job, userId])

  // Derive display state during render (cache hits render instantly; the cost gate
  // + usage logging live in the service).
  const asyncForThisJob = asyncJd && asyncJd.jobId === jobId ? asyncJd : null
  let formatted: string | null
  let source: 'llm' | 'fallback' | null
  let formatting: boolean
  if (!open || !job || raw.length === 0) {
    formatted = null
    source = null
    formatting = false
  } else if (cached) {
    formatted = cached.markdown
    source = cached.source
    formatting = false
  } else if (!userId) {
    formatted = raw
    source = 'fallback'
    formatting = false
  } else if (asyncForThisJob) {
    formatted = asyncForThisJob.markdown
    source = asyncForThisJob.source
    formatting = false
  } else {
    formatted = null
    source = null
    formatting = true
  }

  if (!job) return null

  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)
  const sourceLabel = deriveSourceLabel(job.source_url)
  const companyName = job.company_name ?? 'Unknown company'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Override default sm:max-w-sm to allow comfortable reading width
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        {/* ── Header region ──────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-6 pb-5 pt-6">
          {/* Company identity — the primary anchor at the very top */}
          <div className="flex items-center gap-3 pr-10">
            <CompanyLogo
              companyName={job.company_name}
              domain={job.company_domain}
              className="h-12 w-12"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{companyName}</p>
              <p className="truncate text-xs text-muted-foreground">via {sourceLabel}</p>
            </div>
          </div>

          <SheetHeader className="mt-4 space-y-1">
            <SheetTitle className="pr-6 text-lg font-semibold leading-snug text-foreground">
              {job.title}
            </SheetTitle>
            {/* SheetDescription must always render for a11y (Radix Dialog) */}
            <SheetDescription className="sr-only">
              {job.company_name ? `${job.title} at ${job.company_name}` : job.title}
            </SheetDescription>
          </SheetHeader>

          {/* Meta pills row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {job.remote_type && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  REMOTE_BADGE_CLASSES[job.remote_type] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {job.remote_type.charAt(0).toUpperCase() + job.remote_type.slice(1)}
              </span>
            )}
            {job.job_type && (
              <MetaPill icon={<Briefcase className="h-3 w-3" />} label={job.job_type} />
            )}
            {comp && <MetaPill icon={<DollarSign className="h-3 w-3" />} label={comp} />}
            {job.location && <MetaPill icon={<MapPin className="h-3 w-3" />} label={job.location} />}
            {job.posted_at && (
              <MetaPill icon={<Calendar className="h-3 w-3" />} label={dateLabel} />
            )}
          </div>
        </div>

        {/* ── Scrollable description body ────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {job.description ? (
            formatting ? (
              <JobDescriptionSkeleton />
            ) : (
              <div className="space-y-3">
                {source === 'llm' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Formatted for readability
                  </div>
                )}
                <JobDescriptionMarkdown markdown={formatted ?? job.description} />
              </div>
            )
          ) : (
            <p className="text-sm italic text-muted-foreground">No description provided.</p>
          )}
        </div>

        {/* ── Sticky footer CTA — high-contrast BKT primary ──────────── */}
        <div className="shrink-0 border-t border-border bg-card px-6 py-4">
          <Button
            asChild
            className="w-full gap-2 bg-primary font-semibold text-zinc-50 shadow-sm hover:bg-primary/90"
          >
            <a href={job.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Apply on {sourceLabel}
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
