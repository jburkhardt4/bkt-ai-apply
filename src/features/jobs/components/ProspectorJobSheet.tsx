import { ExternalLink, MapPin, Briefcase, DollarSign, Calendar } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'
import {
  REMOTE_BADGE_CLASSES,
  formatCompensation,
  formatRelativeDate,
  deriveSourceLabel,
} from './prospectorJobFields'

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProspectorJobSheetProps {
  job: ProspectorSearchResult | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProspectorJobSheet({ job, open, onOpenChange }: ProspectorJobSheetProps) {
  if (!job) return null

  const comp = formatCompensation(job.compensation_min, job.compensation_max)
  const dateLabel = formatRelativeDate(job.posted_at)
  const sourceLabel = deriveSourceLabel(job.source_url)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Override default sm:max-w-sm to allow comfortable reading width
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        {/* ── Header region ──────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-6 pb-5 pt-6">
          <SheetHeader className="space-y-1">
            <SheetTitle className="pr-6 text-base font-semibold leading-snug text-foreground">
              {job.title}
            </SheetTitle>
            {job.company_name ? (
              <SheetDescription className="text-sm font-medium text-muted-foreground">
                {job.company_name}
              </SheetDescription>
            ) : (
              // SheetDescription must always render for a11y — use sr-only fallback
              <SheetDescription className="sr-only">Job details</SheetDescription>
            )}
          </SheetHeader>

          {/* Meta pills row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {job.remote_type && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  REMOTE_BADGE_CLASSES[job.remote_type] ??
                    'bg-muted text-muted-foreground',
                )}
              >
                {job.remote_type.charAt(0).toUpperCase() + job.remote_type.slice(1)}
              </span>
            )}
            {job.job_type && (
              <MetaPill
                icon={<Briefcase className="h-3 w-3" />}
                label={job.job_type}
              />
            )}
            {comp && (
              <MetaPill
                icon={<DollarSign className="h-3 w-3" />}
                label={comp}
              />
            )}
            {job.location && (
              <MetaPill
                icon={<MapPin className="h-3 w-3" />}
                label={job.location}
              />
            )}
            {job.posted_at && (
              <MetaPill
                icon={<Calendar className="h-3 w-3" />}
                label={dateLabel}
              />
            )}
          </div>
        </div>

        {/* ── Scrollable description body ────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {job.description ? (
            <p
              className="max-w-prose text-sm leading-relaxed text-foreground/80 whitespace-pre-line"
            >
              {job.description}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No description provided.</p>
          )}
        </div>

        {/* ── Sticky footer CTA ──────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-6 py-4">
          <Button
            asChild
            className="w-full gap-2"
          >
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              Apply on {sourceLabel}
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
