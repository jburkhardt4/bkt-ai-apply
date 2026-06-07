import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProspectorRunStatusProps {
  lastRunAt: string | null
  nextRunAt: string | null
  isRunning: boolean
  onRunNow: () => void
}

function formatRunDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

export function ProspectorRunStatus({
  lastRunAt,
  nextRunAt,
  isRunning,
  onRunNow,
}: ProspectorRunStatusProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="font-medium text-muted-foreground">Last run</dt>
        <dd className="text-foreground">{formatRunDate(lastRunAt)}</dd>
        <dt className="font-medium text-muted-foreground">Next run</dt>
        <dd className="text-foreground">{formatRunDate(nextRunAt)}</dd>
      </dl>

      <Button
        variant="outline"
        size="sm"
        onClick={onRunNow}
        disabled={isRunning}
        className="gap-1.5 self-start sm:self-auto"
      >
        <PlayCircle className="h-4 w-4" />
        {isRunning ? 'Running…' : 'Run Now'}
      </Button>
    </div>
  )
}
