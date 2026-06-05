import LoginPage from './pages/LoginPage'
import IngestionPage from './pages/IngestionPage'
import PipelinePage from './pages/PipelinePage'

export default function App() {
  const path = window.location.pathname

  if (path === '/login') {
    return <LoginPage />
  }

  if (path === '/ingestion') {
    return <IngestionPage />
  }

  return <PipelinePage />
}

