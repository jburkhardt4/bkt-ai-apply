import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Send, Plus, History, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useChatConversations } from '../hooks/useChatConversations'
import type { ChatMessage } from '../types'

interface AiAssistantPanelProps {
  selectedApplicationId?: string | null
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const deferred = !isUser && message.metadata.status === 'deferred'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'w-fit max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : deferred
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'bg-muted text-foreground',
        )}
      >
        {message.content}
      </div>
    </div>
  )
}

export function AiAssistantPanel({ selectedApplicationId = null }: AiAssistantPanelProps) {
  const chat = useChatConversations(selectedApplicationId)
  const [prompt, setPrompt] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const activeTitle = useMemo(() => {
    const current = chat.conversations.find((c) => c.id === chat.activeId)
    return current?.title ?? 'New chat'
  }, [chat.conversations, chat.activeId])

  // Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const canSend = prompt.trim().length > 0 && !chat.sending

  async function handleSend() {
    const text = prompt.trim()
    if (!text || chat.sending) return
    setPrompt('')
    await chat.send(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            AI Assistant
          </p>
          <p className="truncate text-xs text-muted-foreground">{activeTitle}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Conversation history"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="New chat"
          onClick={() => {
            setHistoryOpen(false)
            chat.startNewConversation()
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversation history */}
      {historyOpen && (
        <div className="max-h-48 overflow-y-auto border-b border-border py-2">
          {chat.conversations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No saved chats yet.</p>
          ) : (
            chat.conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md px-2 py-1.5',
                  c.id === chat.activeId && 'bg-muted',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  onClick={() => {
                    chat.selectConversation(c.id)
                    setHistoryOpen(false)
                  }}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  onClick={() => void chat.remove(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {chat.messages.length === 0 && !chat.loadingMessages ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40" />
            <p className="px-4 text-sm text-muted-foreground">
              Ask anything about your pipeline, scores, or strategy.
            </p>
          </div>
        ) : (
          chat.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {chat.sending && (
          <div className="flex justify-start">
            <div className="w-fit rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Error */}
      {chat.error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription className="text-xs">{chat.error}</AlertDescription>
        </Alert>
      )}

      {/* Composer */}
      <div className="border-t border-border pt-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the assistant… (Ctrl+Enter to send)"
          rows={3}
          className="resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {selectedApplicationId ? 'Scoped to selected application' : 'Pipeline-aware'}
          </span>
          <Button size="sm" className="gap-1.5" disabled={!canSend} onClick={() => void handleSend()}>
            <Send className="h-3.5 w-3.5" />
            {chat.sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
