import { LayoutDashboard, Upload, Search, LogOut, Zap, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: 'Ingestion',
    href: '/ingestion',
    icon: <Upload className="h-4 w-4" />,
  },
  {
    label: 'Prospector',
    href: '/prospector',
    icon: <Search className="h-4 w-4" />,
  },
  {
    label: 'Integrations',
    href: '/settings',
    icon: <Plug className="h-4 w-4" />,
  },
]

interface AppSidebarProps {
  className?: string
  onNavigate?: () => void
}

export function AppSidebar({ className, onNavigate }: AppSidebarProps) {
  const { user, signOut } = useAuth()
  const currentPath = window.location.pathname

  const handleNav = (href: string) => {
    onNavigate?.()
    window.location.assign(href)
  }

  const handleSignOut = async () => {
    await signOut()
    window.location.assign('/login')
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted-foreground">
            BKT
          </p>
          <p className="text-sm font-semibold leading-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            AI-Apply
          </p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.href)

          return (
            <button
              key={item.href}
              onClick={() => handleNav(item.href)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="mt-auto px-3 pb-4">
        <Separator className="mb-3 bg-sidebar-border" />
        <div className="rounded-md px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleSignOut()}
          className="mt-1 w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
