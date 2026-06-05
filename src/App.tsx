import LoginPage from './pages/LoginPage'
import PipelinePage from './pages/PipelinePage'

export default function App() {
  const path = window.location.pathname
  return path === '/login' ? <LoginPage /> : <PipelinePage />
}

