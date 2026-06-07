import { cn } from '@/lib/utils'

interface ProspectorToggleProps {
  isActive: boolean
  isUpdating: boolean
  onToggle: (active: boolean) => void
}

export function ProspectorToggle({ isActive, isUpdating, onToggle }: ProspectorToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'text-sm font-medium',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        Auto-Search
      </span>

      {/* Native accessible toggle — styled as a large track/thumb switch */}
      <button
        role="switch"
        aria-checked={isActive}
        aria-label={isActive ? 'Disable auto-search' : 'Enable auto-search'}
        disabled={isUpdating}
        onClick={() => onToggle(!isActive)}
        className={cn(
          'relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isActive ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0',
            'transition-transform duration-200',
            isActive ? 'translate-x-7' : 'translate-x-0.5',
          )}
        />
      </button>

      <span
        className={cn(
          'min-w-[2.5rem] text-sm font-semibold',
          isActive ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {isActive ? 'ON' : 'OFF'}
      </span>
    </div>
  )
}
