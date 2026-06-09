import { IntegrationsPanel } from '@/features/settings/components/IntegrationsPanel'

/**
 * Route entry point for /settings.
 * Thin shell — all logic and layout live in the settings feature.
 * Protected by AppShell (unauthenticated users redirect to /login).
 */
export default function SettingsPage() {
  return <IntegrationsPanel />
}
