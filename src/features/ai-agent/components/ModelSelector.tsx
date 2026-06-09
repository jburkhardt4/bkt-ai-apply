import { AlertCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CHAT_MODEL_CATALOG, type ChatModelOption } from '@/lib/ai-router'
import type { AiModelProvider } from '@/types/pipeline'
import type { ProviderStatusMap } from '@/features/settings/types'

interface ModelSelectorProps {
  value: string
  onValueChange: (modelName: string) => void
  status: ProviderStatusMap | null
  loading?: boolean
  disabled?: boolean
}

const PROVIDER_GROUPS: { provider: AiModelProvider; label: string }[] = [
  { provider: 'anthropic', label: 'Anthropic' },
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'google', label: 'Google' },
]

function isProviderConfigured(
  status: ProviderStatusMap | null,
  provider: AiModelProvider,
  loading: boolean,
): boolean {
  // While the status is still loading, allow selection so options don't flicker
  // between disabled and enabled.
  if (loading || !status) return true
  return status[provider] === true
}

/**
 * Sleek model picker for the AI Assistant. Groups models by provider and greys
 * out any model whose provider key has not been configured (Settings →
 * Integrations), with an inline "no key" hint.
 */
export function ModelSelector({
  value,
  onValueChange,
  status,
  loading = false,
  disabled = false,
}: ModelSelectorProps) {
  const groups = PROVIDER_GROUPS.map((group) => ({
    ...group,
    models: CHAT_MODEL_CATALOG.filter((m) => m.provider === group.provider),
  })).filter((group) => group.models.length > 0)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-full text-xs" aria-label="Select AI model">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              {group.label}
            </SelectLabel>
            {group.models.map((model: ChatModelOption) => {
              const enabled = isProviderConfigured(status, model.provider, loading)
              return (
                <SelectItem
                  key={model.modelName}
                  value={model.modelName}
                  disabled={!enabled}
                  className="text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    {model.label}
                    {!enabled && (
                      <span className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                        <AlertCircle className="h-3 w-3" aria-hidden /> no key
                      </span>
                    )}
                  </span>
                </SelectItem>
              )
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
