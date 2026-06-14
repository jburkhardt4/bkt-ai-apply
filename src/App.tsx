import { Toaster } from 'sonner'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/react'
import LoginPage from './pages/LoginPage'
import IngestionPage from './pages/IngestionPage'
import PipelinePage from './pages/PipelinePage'
import ProspectorPage from './pages/ProspectorPage'
import SettingsPage from './pages/SettingsPage'
import { AppShell } from './components/AppShell'
import { AutoApplyDashboard } from './features/auto-apply/AutoApplyDashboard'
import { DocsRoute, InboxRoute, SavedRoute, SearchRoute } from './features/auto-apply/routes'
import { PreferencesScreen } from './features/auto-apply/screens/PreferencesScreen'
import { InterviewPrepScreen } from './features/auto-apply/screens/InterviewPrepScreen'
import { PlaceholderScreen } from './features/auto-apply/components/chrome'
import { useBktToast } from './components/bkt/toast-context'
import { useNavKey } from './features/auto-apply/router'
import type { NavKey } from './features/auto-apply/types'

function PreferencesRoute() {
  const toast = useBktToast()
  return <PreferencesScreen onToast={toast} />
}

/** Legacy operational pages keep their Tailwind layout inside the new shell. */
function LegacyPage({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-6 md:p-8">{children}</div>
}

function RoutedPage({ navKey }: { navKey: NavKey }) {
  switch (navKey) {
    case 'inbox':
      return <InboxRoute />
    case 'search':
      return <SearchRoute />
    case 'saved':
      return <SavedRoute />
    case 'prefs':
      return <PreferencesRoute />
    case 'resumes':
      return <DocsRoute type="resume" />
    case 'letters':
      return <DocsRoute type="letter" />
    case 'interview-prep':
      return <InterviewPrepScreen />
    case 'notifications':
      return <PlaceholderScreen label="Notifications" />
    case 'pipeline':
      return (
        <LegacyPage>
          <PipelinePage />
        </LegacyPage>
      )
    case 'ingestion':
      return (
        <LegacyPage>
          <IngestionPage />
        </LegacyPage>
      )
    case 'prospector':
      return (
        <LegacyPage>
          <ProspectorPage />
        </LegacyPage>
      )
    case 'integrations':
      return (
        <LegacyPage>
          <SettingsPage />
        </LegacyPage>
      )
    case 'dashboard':
    default:
      return <AutoApplyDashboard />
  }
}

export default function App() {
  const navKey = useNavKey()
  const path = window.location.pathname

  if (path === '/login') {
    return (
      <>
        <LoginPage />
        <Toaster richColors position="top-right" />
        <Analytics />
      </>
    )
  }

  return (
    <>
      <AppShell>
        <RoutedPage navKey={navKey} />
      </AppShell>
      <Toaster richColors position="top-right" />
      <Analytics />
    </>
  )
}
