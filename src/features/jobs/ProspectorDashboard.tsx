import { useCallback } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ProspectorToggle } from './components/ProspectorToggle'
import { ProspectorProfileForm, type ProspectorFormValues } from './components/ProspectorProfileForm'
import { ProspectorRunStatus } from './components/ProspectorRunStatus'
import { ProspectorReadyQueue } from './components/ProspectorReadyQueue'
import { useProspectorProfile } from './hooks/useProspectorProfile'
import { useProspectingRuns } from './hooks/useProspectingRuns'
import { useProspectorReadyQueue } from './hooks/useProspectorReadyQueue'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'

export function ProspectorDashboard() {
  const { user } = useAuth()

  // Live Supabase state — replaces all mock state (BR-004, BR-005, BR-008)
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    upsertProfile,
    toggleActive,
    isSaving,
    isToggling,
  } = useProspectorProfile()

  const {
    lastRunAt,
    loading: runsLoading,
    refetch: refetchRuns,
  } = useProspectingRuns()

  const {
    jobs: queuedJobs,
    loading: queueLoading,
    refetch: refetchQueue,
  } = useProspectorReadyQueue()


  // next_run_at lives on the profile row (set by the Edge Function)
  const nextRunAt = profile?.next_run_at ?? null

  // ── Handlers ─────────────────────────────────────────────────

  const handleSave = useCallback(
    async (values: ProspectorFormValues) => {
      await upsertProfile({
        job_titles: values.jobTitles,
        locations: values.locations,
        job_types: values.jobTypes,
        environments: values.environments,
        min_salary: values.minSalary,
        keywords: values.keywords,
        // Preserve existing is_active state; toggle controls it separately
        is_active: profile?.is_active ?? false,
      })
      toast.success('Profile saved')
    },
    [upsertProfile, profile],
  )

  const handleToggle = useCallback(
    async (active: boolean) => {
      await toggleActive(active)
      // Only show toast on success — error is shown via profileError
      if (!profileError) {
        toast.success(active ? 'Auto-Search enabled' : 'Auto-Search disabled')
      }
    },
    [toggleActive, profileError],
  )

  const handleRunNow = useCallback(async () => {
    if (!user || !profile) return

    // Sprint stub: update last_run_at on the profile row directly.
    // The actual Edge Function trigger is wired in a later sprint.
    const supabase = getSupabaseClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('prospecting_profiles')
      .update({ last_run_at: now })
      .eq('user_id', user.id)

    if (error) {
      toast.error('Failed to trigger run')
    } else {
      toast.success('Run triggered')
      refetchRuns()
      refetchQueue()
    }
  }, [user, profile, refetchRuns, refetchQueue])

  // ── Loading skeleton ─────────────────────────────────────────

  const isInitialLoading = profileLoading && runsLoading

  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-1.5 h-4 w-52" />
          </div>
          <Skeleton className="h-7 w-32 sm:mt-2" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
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
            isActive={profile?.is_active ?? false}
            isUpdating={isToggling}
            onToggle={handleToggle}
          />
        </div>
      </div>

      {/* Inline error banner — shown on fetch error, non-throwing */}
      {profileError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load profile: {profileError}
        </div>
      )}

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
            key={profile?.id ?? 'new'}
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
            isRunning={false}
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
            isLoading={queueLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
