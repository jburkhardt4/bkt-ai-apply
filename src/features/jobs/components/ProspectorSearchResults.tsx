import { ExternalLink, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProspectorSearchResult } from '../hooks/useProspectorSearchResults'

interface ProspectorSearchResultsProps {
  jobs: ProspectorSearchResult[]
  isLoading: boolean
}

const REMOTE_BADGE: Record<string, string> = {
  remote: 'bg-green-500/15 text-green-700 dark:text-green-400',
  hybrid: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  onsite: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
}

function RemoteBadge({ type }: { type: string | null }) {
  if (!type) return null
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        REMOTE_BADGE[type] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function formatCompensation(min: number | null, max: number | null): string | null {
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`)
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`
  if (min != null) return `${fmt(min)}+`
  if (max != null) return `Up to ${fmt(max)}`
  return null
}

export function ProspectorSearchResults({ jobs, isLoading }: ProspectorSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No results yet. Run a search to discover new jobs.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} found
      </p>
      <ul className="divide-y divide-border">
        {jobs.map((job) => {
          const comp = formatCompensation(job.compensation_min, job.compensation_max)
          return (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {job.company_name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {job.company_name}
                    </span>
                  )}
                  {job.location && !job.remote_type && (
                    <span className="truncate text-xs text-muted-foreground">{job.location}</span>
                  )}
                  {comp && (
                    <span className="text-xs font-medium text-foreground/70">{comp}</span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <RemoteBadge type={job.remote_type} />
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  aria-label={`View job listing for ${job.title}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
