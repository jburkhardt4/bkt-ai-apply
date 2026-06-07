import { ArrowRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProspectorJobMatch {
  id: string
  title: string
  company_name: string
  match_score: number
  application_id: string | null
}

interface ProspectorReadyQueueProps {
  jobs: ProspectorJobMatch[]
  isLoading: boolean
}

function ScoreBadge({ score }: { score: number }) {
  const colorClass =
    score >= 80
      ? 'bg-green-500/15 text-green-700 dark:text-green-400'
      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        colorClass,
      )}
    >
      {score}
    </span>
  )
}

export function ProspectorReadyQueue({ jobs, isLoading }: ProspectorReadyQueueProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span className="animate-pulse text-sm text-muted-foreground">Loading matches…</span>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No qualified matches yet. Enable Auto-Search to start prospecting.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        {jobs.length} {jobs.length === 1 ? 'match' : 'matches'} found
      </p>
      <ul className="divide-y divide-border">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
              <p className="truncate text-xs text-muted-foreground">{job.company_name}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ScoreBadge score={job.match_score} />
              {job.application_id ? (
                <a
                  href={`/pipeline?applicationId=${job.application_id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  aria-label={`View application for ${job.title}`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground/30">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
