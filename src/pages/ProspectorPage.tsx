import { ProspectorDashboard } from '@/features/jobs/ProspectorDashboard'

/**
 * Route entry point for /prospector.
 * Thin shell — all logic and layout lives in ProspectorDashboard.
 * Protected by AppShell (unauthenticated users redirect to /login).
 */
export default function ProspectorPage() {
  return <ProspectorDashboard />
}
