import { Toaster } from 'sonner'
import LoginPage from './pages/LoginPage'
import IngestionPage from './pages/IngestionPage'
import PipelinePage from './pages/PipelinePage'
import ProspectorPage from './pages/ProspectorPage'
import { AppShell } from './components/AppShell'

export default function App() {
  const path = window.location.pathname

  if (path === '/login') {
    return (
      <>
        <LoginPage />
        <Toaster richColors position="top-right" />
      </>
    )
  }

  return (
    <>
      <AppShell>
        {path === '/ingestion' ? (
          <IngestionPage />
        ) : path === '/prospector' ? (
          <ProspectorPage />
        ) : (
          <PipelinePage />
        )}
      </AppShell>
      <Toaster richColors position="top-right" />
    </>
  )
}
