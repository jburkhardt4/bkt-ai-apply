import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bot, Menu } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/auth-context'
import { ChatAssistantPanel } from '@/features/applications/components/ChatAssistantPanel'
import { SelectedApplicationContext } from '@/contexts/selected-application-context'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { loading, user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [chatMobileOpen, setChatMobileOpen] = useState(false)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState<number>(320)
  const [isDraggingState, setIsDraggingState] = useState<boolean>(false)
  const startX = useRef<number>(0)
  const startWidth = useRef<number>(320)

  function handleResizeMouseDown(e: React.MouseEvent) {
    // Prevent the initial focus/selection trigger and suppress page-wide
    // text selection for the duration of the drag.
    e.preventDefault()
    document.body.style.userSelect = 'none'
    setIsDraggingState(true)
    startX.current = e.clientX
    startWidth.current = sidebarWidth
  }

  useEffect(() => {
    if (!isDraggingState) return
    function handleMouseMove(e: MouseEvent) {
      const newWidth = startWidth.current - (e.clientX - startX.current)
      const clamped = Math.min(Math.max(newWidth, 320), window.innerWidth * 0.4)
      setSidebarWidth(clamped)
    }
    function handleMouseUp() {
      document.body.style.userSelect = ''
      setIsDraggingState(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      // Revert in case the component unmounts mid-drag so the body style
      // is never left stuck in a non-selectable state.
      document.body.style.userSelect = ''
    }
  }, [isDraggingState])

  useEffect(() => {
    if (!loading && !user) {
      window.location.assign('/login')
    }
  }, [loading, user])

  if (loading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <span className="animate-pulse text-sm text-muted-foreground">Loading…</span>
      </div>
    )
  }

  return (
    <SelectedApplicationContext.Provider value={{ selectedApplicationId, setSelectedApplicationId }}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop left nav sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-sidebar-border md:flex md:flex-col">
          <AppSidebar className="flex-1" />
        </aside>

        {/* Mobile left nav via Sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-56 p-0">
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile topbar */}
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="flex-1 text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              BKT AI-Apply
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatMobileOpen(true)}
              aria-label="Open AI chat"
            >
              <Bot className="h-5 w-5" />
            </Button>
          </header>

          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            {children}
          </main>
        </div>

        {/* Right chat sidebar — desktop only */}
        <aside
          className="hidden shrink-0 flex-row border-l border-border md:flex overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <div
            data-testid="chat-resize-handle"
            className={`w-1 h-full cursor-col-resize transition-colors hover:bg-border${isDraggingState ? ' bg-accent' : ''}`}
            onMouseDown={handleResizeMouseDown}
          />
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <ChatAssistantPanel selectedApplicationId={selectedApplicationId} />
          </div>
        </aside>
      </div>

      {/* Mobile chat via Sheet — triggered by topbar Bot button */}
      <Sheet open={chatMobileOpen} onOpenChange={setChatMobileOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <div className="flex h-full flex-col overflow-y-auto p-4">
            <ChatAssistantPanel selectedApplicationId={selectedApplicationId} />
          </div>
        </SheetContent>
      </Sheet>
    </SelectedApplicationContext.Provider>
  )
}
