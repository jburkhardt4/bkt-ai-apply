import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ProviderMeta } from '../types'

interface ProviderStatusCardProps {
  provider: ProviderMeta
  configured: boolean
  loading: boolean
}

/** Presentational — renders a single provider's configured/not-configured state. */
export function ProviderStatusCard({ provider, configured, loading }: ProviderStatusCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{provider.name}</p>
            {loading ? (
              <Badge variant="outline" className="animate-pulse">
                Checking…
              </Badge>
            ) : configured ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> Configured
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" aria-hidden /> Not configured
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Secret:{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
              {provider.envVar}
            </code>
          </p>
        </div>
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Get key <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </CardContent>
    </Card>
  )
}
