import { useEffect, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/auth-context'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { loading, user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

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
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border md:flex md:flex-col">
        <AppSidebar className="flex-1" />
      </aside>

      {/* Mobile sidebar via Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 p-0">
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
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
          <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            BKT AI-Apply
          </span>
        </header>

        <main className="flex-1 overflow-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
