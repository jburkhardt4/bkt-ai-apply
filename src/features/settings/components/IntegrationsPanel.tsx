import { useEffect } from 'react'
import { toast } from 'sonner'
import { RefreshCw, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useProviderStatus } from '../hooks/useProviderStatus'
import { ProviderStatusCard } from './ProviderStatusCard'
import type { ProviderMeta } from '../types'

// Provider metadata is presentation-only; the actual keys live as Supabase
// Edge Function secrets (ANTHROPIC_KEY / OPENAI_KEY / GEMINI_KEY).
const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Powers Claude models for chat, match scoring, and cover letters.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    envVar: 'ANTHROPIC_KEY',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    description: 'Powers GPT models for resume rewriting and general chat.',
    docsUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_KEY',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    description: 'Powers Gemini models for research and email classification.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    envVar: 'GEMINI_KEY',
  },
]

/**
 * Integrations settings surface — shows which model providers have a key
 * configured. Keys are managed as server-side Supabase secrets, so this view is
 * status-only (no key entry); it never receives or displays key material.
 */
export function IntegrationsPanel() {
  const { status, loading, error, refresh } = useProviderStatus()

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  async function handleRefresh() {
    const toastId = toast.loading('Checking provider keys…')
    try {
      await refresh()
      toast.success('Provider status updated', { id: toastId })
    } catch {
      toast.error('Could not refresh provider status', { id: toastId })
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div>
            <h1
              className="text-lg font-semibold text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground">
              Model provider API keys for the AI Assistant.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void handleRefresh()}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
          Refresh
        </Button>
      </header>

      <Alert>
        <AlertDescription className="text-xs text-muted-foreground">
          Keys are stored as server-side Supabase Edge Function secrets and are never exposed to the
          browser. To add or rotate a key, update its secret in your Supabase project settings, then
          press Refresh.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderStatusCard
            key={p.id}
            provider={p}
            configured={status?.[p.id] ?? false}
            loading={loading}
          />
        ))}
      </div>
    </div>
  )
}
