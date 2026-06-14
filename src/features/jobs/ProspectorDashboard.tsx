import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
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
import { useAutoApplySettings } from '@/features/auto-apply/settings-context'
import { cn } from '@/lib/utils'
import { runScoreForJob } from '@/features/applications/services/ingestionService'
import { graduateProspectorMatches } from './services/prospectorGraduationService'
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
  const { settings, loading: settingsLoading } = useAutoApplySettings()

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

  // ── Score unscored prospector jobs ───────────────────────────
  // Prospector jobs are inserted by the prospector-cron Edge Function but are
  // not scored there. This reuses the ingestion scoring pipeline
  // (ingestionService.runScoreForJob → aiScoringService.scoreJobFitWithLlm,
  // which calls the score-job-fit Edge Function and falls back to the
  // pipelineService.scoreJobFit heuristic on cost cap / Edge error) for any
  // prospector job lacking an ai_scores row. Cost-cap is respected per job
  // (the result returns status 'queued' when the monthly cap is hit, BR-104).

  const [isScoring, setIsScoring] = useState(false)

  const unscoredCount = searchResults.filter((job) => job.match_score === null).length

  const handleScoreJobs = useCallback(async () => {
    if (!user || isScoring) return
    const unscored = searchResults.filter((job) => job.match_score === null)
    if (unscored.length === 0) return

    setIsScoring(true)
    const toastId = toast.loading(
      `Scoring ${unscored.length} ${unscored.length === 1 ? 'job' : 'jobs'}…`,
    )

    // Score sequentially (not Promise.allSettled): each runScoreForJob re-reads
    // the monthly AI spend via routeAiTask before its LLM call, so the $75 cost
    // cap (BR-052 / BR-104) is enforced per job and later jobs queue once the cap
    // is hit. Parallel dispatch would let every job read the same pre-call spend
    // and overshoot the cap.
    let saved = 0
    let queued = 0
    let failed = 0
    for (const job of unscored) {
      try {
        const result = await runScoreForJob({
          userId: user.id,
          jobId: job.id,
          prospectorProfile: profile,
        })
        if (result.status === 'queued') queued += 1
        else saved += 1
      } catch {
        failed += 1
      }
    }

    // Graduate the freshly-scored jobs into the pipeline: create discovery
    // applications for matches >= 60 and (in assist/auto mode) enqueue those
    // at/above the user's threshold. Idempotent and mode-aware — review mode
    // enqueues nothing. The worker's claim_submission re-validates server-side.
    try {
      await graduateProspectorMatches({ userId: user.id, reviewMode: settings.reviewMode })
    } catch {
      // Non-fatal: scoring still succeeded; the ready queue will catch up on reload.
    }

    // Scoring writes ai_scores (search results) and may update
    // applications.match_score (ready queue) — refresh both.
    refetchSearchResults()
    refetchQueue()

    const parts = [`${saved} scored`]
    if (queued > 0) parts.push(`${queued} queued (cost cap)`)
    if (failed > 0) parts.push(`${failed} failed`)
    const summary = parts.join(' · ')

    if (saved === 0 && failed > 0) {
      toast.error(`Scoring failed — ${summary}`, { id: toastId })
    } else {
      toast.success(`Scoring complete — ${summary}`, { id: toastId })
    }

    setIsScoring(false)
  }, [user, isScoring, searchResults, refetchSearchResults, refetchQueue, settings, profile])

  // ── Graduate already-scored matches into the pipeline (once per mount) ──
  // Prospector jobs scored in earlier sessions never created applications, so
  // the Ready Queue could stay empty despite strong matches. This backfills
  // them (and enqueues per review mode) the first time the dashboard mounts.
  const graduatedRef = useRef(false)
  useEffect(() => {
    if (!user || settingsLoading || graduatedRef.current) return
    graduatedRef.current = true
    graduateProspectorMatches({ userId: user.id, reviewMode: settings.reviewMode })
      .then((result) => {
        if (result.created > 0 || result.enqueued > 0) {
          refetchQueue()
          if (result.created > 0) {
            toast.success(
              `${result.created} ${result.created === 1 ? 'match' : 'matches'} added to your pipeline`,
            )
          }
        }
      })
      .catch(() => {
        // Non-fatal: the ready queue still reflects whatever already exists.
      })
  }, [user, settingsLoading, settings.reviewMode, refetchQueue])

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
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
          <CardTitle
            className="text-base"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Job Search Results
          </CardTitle>
          {unscoredCount > 0 && (
            <button
              type="button"
              onClick={handleScoreJobs}
              disabled={isScoring || !user}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'border border-input bg-background text-xs font-medium text-muted-foreground',
                'transition-all duration-150',
                'hover:bg-muted/60 hover:text-foreground',
                'active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
              )}
              aria-label={`Score ${unscoredCount} unscored ${unscoredCount === 1 ? 'job' : 'jobs'}`}
            >
              <Sparkles className={cn('h-3.5 w-3.5', isScoring && 'animate-pulse')} />
              {isScoring
                ? 'Scoring…'
                : `Score ${unscoredCount} ${unscoredCount === 1 ? 'job' : 'jobs'}`}
            </button>
          )}
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
