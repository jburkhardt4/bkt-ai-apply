import { useCallback, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ProspectorToggle } from './components/ProspectorToggle'
import { ProspectorProfileForm, type ProspectorFormValues } from './components/ProspectorProfileForm'
import { ProspectorRunStatus } from './components/ProspectorRunStatus'
import { ProspectorSearchResults } from './components/ProspectorSearchResults'
import { ProspectorReadyQueue } from './components/ProspectorReadyQueue'
import { useProspectorProfile } from './hooks/useProspectorProfile'
import { useProspectingRuns } from './hooks/useProspectingRuns'
import { useProspectorSearchResults } from './hooks/useProspectorSearchResults'
import { useProspectorReadyQueue } from './hooks/useProspectorReadyQueue'
import { getSupabaseClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import {
  summarizeRunResults,
  type ProspectorRunResponse,
} from './summarizeRunResults'

// Manual "Run Now" invoke ceiling. Transport/UX timeout — NOT a domain rule, so
// a literal const is intentional here (cf. LSN-001, which bans hardcoding
// *business* thresholds, not request timeouts).
const RUN_NOW_TIMEOUT_MS = 30_000

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
    jobs: searchResults,
    loading: searchLoading,
    refetch: refetchSearchResults,
  } = useProspectorSearchResults()

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

  const [isRunning, setIsRunning] = useState(false)

  const handleRunNow = useCallback(async () => {
    if (!user || !profile || isRunning) return

    setIsRunning(true)

    // Immediate transient feedback. Reusing this id means the eventual result
    // toast replaces the loading toast in place (sonner id pattern) — no flash
    // of two stacked toasts.
    const toastId = toast.loading('Searching jobs…')

    // Hard ceiling on the invoke so a hung Edge Function can't strand the UI in
    // a permanent "Running…" state. AbortController.signal is forwarded to the
    // underlying fetch by supabase-js.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RUN_NOW_TIMEOUT_MS)

    // Refetch the three live lists. Called on every non-transport-error outcome
    // (success, partial, and empty) so the UI reflects the run even when zero
    // new jobs were added.
    const refetchAll = () => {
      refetchRuns()
      refetchSearchResults()
      refetchQueue()
    }

    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.functions.invoke<ProspectorRunResponse>(
        'prospector-cron',
        { signal: controller.signal },
      )

      if (error) {
        // Transport-level failure (network, non-2xx, abort surfaced as error).
        toast.error('Run failed. Please try again.', { id: toastId })
        return
      }

      const outcome = summarizeRunResults(data ?? null)

      if (outcome.kind === 'error') {
        toast.error(outcome.message, { id: toastId })
      } else if (outcome.kind === 'empty') {
        toast.info(outcome.message, { id: toastId })
      } else {
        toast.success(outcome.message, { id: toastId })
      }

      // Non-transport-error outcome — refetch even on per-profile errors and
      // empty runs so the run history / lists stay current.
      refetchAll()
    } catch (err) {
      // invoke threw (e.g. AbortController fired the timeout). Distinguish the
      // timeout for a clearer message.
      const aborted =
        controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
      toast.error(
        aborted ? 'Search timed out — please try again' : 'Run failed. Please try again.',
        { id: toastId },
      )
    } finally {
      clearTimeout(timeoutId)
      setIsRunning(false)
    }
  }, [user, profile, isRunning, refetchRuns, refetchSearchResults, refetchQueue])

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
            isRunning={isRunning}
            onRunNow={handleRunNow}
          />
        </CardContent>
      </Card>

      {/* Job Search Results card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle
            className="text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Job Search Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProspectorSearchResults
            jobs={searchResults}
            isLoading={searchLoading}
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
