import { useMemo, useState } from 'react'
import { Send, Bot } from 'lucide-react'
import { useAuth } from '../../../contexts/auth-context'
import { runChatAssistant, type ChatAssistantResponse } from '../services/chatAssistantService'
import { buildChatAssistantMeta } from './chatAssistantPanelView'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ChatAssistantPanelProps {
  selectedApplicationId?: string | null
}

function responseBannerClass(response: ChatAssistantResponse | null): string {
  if (response?.status === 'deferred') return 'bg-red-50 border-red-200 text-red-800'
  if (response?.costStatus === 'warn') return 'bg-orange-50 border-orange-200 text-orange-800'
  if (response?.costStatus === 'capped') return 'bg-red-50 border-red-200 text-red-800'
  return 'bg-green-50 border-green-200 text-green-800'
}

export function ChatAssistantPanel({ selectedApplicationId = null }: ChatAssistantPanelProps) {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<ChatAssistantResponse | null>(null)

  const metadata = useMemo(() => (response ? buildChatAssistantMeta(response) : []), [response])
  const canSubmit = prompt.trim().length > 0 && !loading && !!user?.id

  async function submitMessage() {
    const userId = user?.id
    const message = prompt.trim()
    if (!userId || !message) return

    setLoading(true)
    setError(null)
    try {
      const nextResponse = await runChatAssistant({ userId, message, applicationId: selectedApplicationId ?? undefined })
      setResponse(nextResponse)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get assistant response')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitMessage()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submitMessage()
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base" style={{ fontFamily: 'var(--font-display)' }}>
              AI Chat Assistant
            </CardTitle>
            <CardDescription className="text-xs">
              Strategy support from your pipeline context.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
          <label htmlFor="chat-prompt" className="text-xs font-medium text-muted-foreground">
            Ask about score rationale, follow-up drafts, or targeting strategy
          </label>
          <Textarea
            id="chat-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (Ctrl+Enter to send)"
            rows={4}
            className="resize-y text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedApplicationId ? 'Scoped to selected application.' : 'Using pipeline context.'}
            </span>
            <Button type="submit" disabled={!canSubmit} size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {loading ? 'Working…' : 'Ask'}
            </Button>
          </div>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {response && (
          <div className={`rounded-lg border p-3 space-y-2 ${responseBannerClass(response)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">
              {response.status === 'deferred' ? 'Deferred — AI cap reached' : 'Assistant response'}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{response.answerText}</p>
            {response.status === 'deferred' && (
              <p className="text-xs font-medium">Reason: {response.deferredReason}</p>
            )}
            {metadata.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-current/20">
                {metadata.map((item) => (
                  <Badge key={item.label} variant="outline" className="text-xs font-normal">
                    {item.label}: {item.value}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
