import { useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProspectorToggle } from './components/ProspectorToggle'
import { ProspectorProfileForm, type ProspectorFormValues, type ProspectingProfile } from './components/ProspectorProfileForm'
import { ProspectorRunStatus } from './components/ProspectorRunStatus'
import { ProspectorReadyQueue, type ProspectorJobMatch } from './components/ProspectorReadyQueue'

// ── Mock state — no Supabase calls in this scaffold ───────────
// All state here is local only. DB integration will be wired in the
// subsequent Feature-Dev gate once the migration is applied and types
// are generated (BR-081, BR-082).

const MOCK_PROFILE: ProspectingProfile | null = null

const MOCK_JOBS: ProspectorJobMatch[] = []

export function ProspectorDashboard() {
  // Profile state
  const [profile, setProfile] = useState<ProspectingProfile | null>(MOCK_PROFILE)
  const [isSaving, setIsSaving] = useState(false)

  // Toggle state
  const [isActive, setIsActive] = useState(false)
  const [isTogglingActive, setIsTogglingActive] = useState(false)

  // Run status state
  const [lastRunAt] = useState<string | null>(null)
  const [nextRunAt] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Ready queue state
  const [queuedJobs] = useState<ProspectorJobMatch[]>(MOCK_JOBS)
  const [isQueueLoading] = useState(false)

  // ── Handlers (mock — no DB calls) ────────────────────────────

  function handleSave(values: ProspectorFormValues) {
    setIsSaving(true)
    // Simulate async save latency for UX testing
    setTimeout(() => {
      const now = new Date().toISOString()
      const saved: ProspectingProfile = {
        id: profile?.id ?? 'mock-id',
        user_id: 'mock-user-id',
        is_active: isActive,
        job_titles: values.jobTitles,
        locations: values.locations,
        job_types: values.jobTypes,
        environments: values.environments,
        min_salary: values.minSalary,
        keywords: values.keywords,
        last_run_at: lastRunAt,
        next_run_at: nextRunAt,
        created_at: profile?.created_at ?? now,
        updated_at: now,
      }
      setProfile(saved)
      setIsSaving(false)
    }, 600)
  }

  function handleToggle(active: boolean) {
    setIsTogglingActive(true)
    setTimeout(() => {
      setIsActive(active)
      setIsTogglingActive(false)
    }, 400)
  }

  function handleRunNow() {
    setIsRunning(true)
    setTimeout(() => {
      setIsRunning(false)
    }, 1500)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            BKT AI-Apply
          </p>
          <h1
            className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <Search className="h-5 w-5 text-muted-foreground" />
            Prospector
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configure your automated job search
          </p>
        </div>

        <div className="sm:mt-2">
          <ProspectorToggle
            isActive={isActive}
            isUpdating={isTogglingActive}
            onToggle={handleToggle}
          />
        </div>
      </div>

      {/* Search Profile card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle
            className="text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Search Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProspectorProfileForm
            profile={profile}
            isSaving={isSaving}
            onSave={handleSave}
          />
        </CardContent>
      </Card>

      {/* Run Status card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle
            className="text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Run Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProspectorRunStatus
            lastRunAt={lastRunAt}
            nextRunAt={nextRunAt}
            isRunning={isRunning}
            onRunNow={handleRunNow}
          />
        </CardContent>
      </Card>

      {/* Ready to Apply card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle
            className="text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Ready to Apply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProspectorReadyQueue
            jobs={queuedJobs}
            isLoading={isQueueLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
