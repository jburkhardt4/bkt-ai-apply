// BKT AI-Apply — Auto Apply dashboard: TopBar + mode tabs (Quick Review /
// Your Jobs) + review-mode menu + JD sidebar + budget modal.
// Orchestration ported from the design-system UI kit's index.html App.
// Data comes from useJobMatches (live Supabase rows when configured,
// design-system seeds otherwise); Apply/Decline write event-sourced stage
// transitions in live mode.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBktToast } from '@/components/bkt/toast-context'
import { useAuth } from '@/contexts/auth-context'
import {
  applyToJob,
  autoApplyToJob,
  declineJob,
  ensureApplicationForJob,
  fetchApplicationTimeline,
  fetchJobMatches,
  markManualApplied,
  markManualInProgress,
} from './services/autoApplyService'
import { openSourceUrl } from './openSourceUrl'
import { fetchSubmittedCount } from '@/features/applications/services/applicationService'
import { runScoreForJob } from '@/features/applications/services/ingestionService'
import { useProspectorProfile } from '@/features/jobs/hooks/useProspectorProfile'
import { ProspectorProfileForm, type ProspectorFormValues } from '@/features/jobs/components/ProspectorProfileForm'
import { graduateProspectorMatches } from '@/features/jobs/services/prospectorGraduationService'
import { triggerProspectorRun } from '@/features/jobs/services/prospectorRunService'
import { usePreparedApplications } from './hooks/usePreparedApplications'
import { useAsyncData } from './hooks/useAutoApplyData'
import { useBudget, useCredits, useReviewMode } from './state'
import { JOBS_SEED } from './data/jobsData'
import { BudgetModal, ModeTabs, ReviewModeMenu, TopBar } from './components/chrome'
import { BktButton } from '@/components/bkt/BktButton'
import { BktCard } from '@/components/bkt/BktCard'
import { Icon } from '@/components/bkt/Icon'
import { REVIEW_MODES } from './reviewModes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { JobsScreen } from './screens/JobsScreen'
import { QuickReview } from './screens/QuickReview'
import { JDSidebar } from './screens/JDSidebar'
import type { JobMatch } from './types'

export function AutoApplyDashboard() {
  const isMobile = useIsMobile()
  const toast = useBktToast()
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data, loading, reload } = useAsyncData(() => fetchJobMatches(userId), [userId])
  // Phase 2b: submitted count comes from `applications` DB truth, not a
  // localStorage delta. Reloads in lockstep with the job-matches fetch.
  const { data: submittedCount, reload: reloadSubmitted } = useAsyncData(
    () => (userId ? fetchSubmittedCount(userId) : Promise.resolve<number | null>(null)),
    [userId],
  )
  const [overrides, setOverrides] = useState<Record<string, JobMatch['status']>>({})
  const jobs: JobMatch[] = (data?.jobs ?? []).map((j) => {
    const status = overrides[String(j.id)]
    return status ? { ...j, status, updated: 'Just now' } : j
  })
  const live = data?.source === 'live'

  const [mode, setMode] = useState<'review' | 'jobs'>('jobs')
  const [credits, setCredits] = useCredits()
  const [budget, setBudget] = useBudget()
  const [openId, setOpenId] = useState<JobMatch['id'] | null>(null)
  const [reviewMode, setReviewMode] = useReviewMode()
  const [budgetOpen, setBudgetOpen] = useState(false)

  // Phase C: the dashboard Play/Pause drives the prospector job SEARCH only.
  // The auto-apply submission `paused` switch is a separate control driven by
  // the Application-Behaviour mode (Review → paused), wired in useReviewMode.
  // `searchActive` mirrors prospecting_profiles.is_active; Resume kicks an
  // immediate run while the 12-hour pg_cron owns the recurring cadence.
  const { profile: prospectorProfile, toggleActive, upsertProfile, isSaving: profileSaving } = useProspectorProfile()
  const searchActive = prospectorProfile?.is_active ?? false
  const [searching, setSearching] = useState(false)
  // ADR-016: the Auto-Search config panel + on-demand scoring live on the
  // Dashboard now (migrated from the removed /prospector page).
  const [configOpen, setConfigOpen] = useState(false)
  const [isScoring, setIsScoring] = useState(false)

  // Live: DB-derived submitted count (fall back to in-view Applied rows until
  // the count resolves). Demo/seed: the seeded stat stays stable.
  const submitted = live
    ? submittedCount ?? jobs.filter((j) => j.status === 'Applied').length
    : JOBS_SEED.stats.submitted
  const matches = live ? jobs.length : JOBS_SEED.stats.matches

  const setStatus = (id: JobMatch['id'], status: JobMatch['status']) => setOverrides((o) => ({ ...o, [String(id)]: status }))

  const apply = (id: JobMatch['id']) => {
    const j = jobs.find((x) => x.id === id)
    if (!j) return

    // Auto mode: the dashboard queues the application for autonomous submission
    // (unchanged behavior — spends a credit, optimistic Applied).
    if (reviewMode === 'auto') {
      setStatus(id, 'Applied')
      setCredits((c) => Math.max(0, c - 1))
      toast(`Application queued — ${j.company}`, 'circle-check', 'var(--bkt-success)')
      if (live) {
        // Prospected/corpus rows (jobId, no applicationId) lazily create + apply
        // via autoApplyToJob; application rows use the existing applyToJob (ADR-016).
        const op = j.applicationId
          ? applyToJob(j, userId)
          : j.jobId
            ? autoApplyToJob(userId, j.jobId).then(() => undefined)
            : Promise.resolve()
        op
          .then(() => {
            reloadSubmitted()
            if (!j.applicationId) reload()
          })
          .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Stage transition failed', 'circle-alert', 'var(--bkt-danger)'))
      }
      return
    }

    // Review / Assist (Hybrid) modes: JB applies by hand on the source posting.
    if (j.status === 'In progress') {
      // Second click on an in-progress row confirms the manual apply.
      setStatus(id, 'Applied')
      toast(`Marked as applied — ${j.company}`, 'circle-check', 'var(--bkt-success)')
      if (live) {
        markManualApplied(j, userId)
          .then(() => {
            reload()
            reloadSubmitted()
          })
          .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Stage transition failed', 'circle-alert', 'var(--bkt-danger)'))
      }
      return
    }

    // First click: open the original posting and move the row to In progress.
    // A manual open is not a submission, so no credit is spent.
    const opened = openSourceUrl(j.sourceUrl)
    setStatus(id, 'In progress')
    if (opened) {
      toast(`Opened ${j.company} — mark as applied when done`, 'external-link', 'var(--bkt-blue-300)')
    } else {
      toast('No source link — mark as applied manually', 'circle-alert', 'var(--bkt-warning)')
    }
    if (live) {
      // Prospected/corpus rows have no application yet — create one (ADR-016),
      // then record the manual-in-progress marker against it.
      const marker = j.applicationId
        ? markManualInProgress(j, userId)
        : j.jobId
          ? ensureApplicationForJob(userId, j.jobId).then((appId) =>
              appId ? markManualInProgress({ ...j, applicationId: appId }, userId) : undefined,
            )
          : Promise.resolve()
      marker.then(() => reload()).catch(() => undefined)
    }
  }

  const decline = (id: JobMatch['id']) => {
    const j = jobs.find((x) => x.id === id)
    if (!j) return
    setStatus(id, 'Declined')
    toast(`Declined — ${j.company}`, 'circle-x', 'var(--bkt-danger)')
    if (live) {
      // Prospected/corpus rows: create the application first, then decline it so
      // the dismissal is event-sourced like any other stage change (ADR-016).
      const op = j.applicationId
        ? declineJob(j, userId)
        : j.jobId
          ? ensureApplicationForJob(userId, j.jobId).then((appId) =>
              appId ? declineJob({ ...j, applicationId: appId, stage: 'discovery' }, userId) : undefined,
            )
          : Promise.resolve()
      op
        .then(() => {
          if (!j.applicationId) reload()
        })
        .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Stage transition failed', 'circle-alert', 'var(--bkt-danger)'))
    }
  }

  // Applied rows: open the board where the application was submitted
  // (application_url, falling back to the posting's source_url).
  const viewApplication = (id: JobMatch['id']) => {
    const j = jobs.find((x) => x.id === id)
    if (!j) return
    const opened = openSourceUrl(j.applicationUrl ?? j.sourceUrl)
    if (!opened) toast('No application link available yet', 'circle-alert', 'var(--bkt-warning)')
  }

  // Play/Pause → job search. Pause flips is_active off (the 8am/6pm pg_cron skips
  // the profile); Resume flips it on and kicks an immediate run, surfacing the
  // searching panel until results refetch.
  const toggleSearch = () => {
    if (searchActive) {
      toggleActive(false)
      toast('Job search paused', 'pause', 'var(--bkt-blue-300)')
      return
    }
    setSearching(true)
    toast('Searching now — scanning sources…', 'play', 'var(--bkt-blue-300)')
    // Await activation before kicking the immediate run: prospector-cron reads
    // active profiles with `.eq('is_active', true)`, so the run must not race
    // ahead of the toggleActive write or it sees the profile still inactive.
    toggleActive(true)
      .then(() => triggerProspectorRun())
      .then((res) => {
        reload()
        if (!res.ok) toast(res.message, 'circle-alert', 'var(--bkt-warning)')
      })
      .finally(() => setSearching(false))
  }

  const reviewCount = jobs.filter((j) => j.status === 'Review').length
  const openJob = jobs.find((j) => j.id === openId) ?? null
  const openApplicationId = openJob?.applicationId ?? null
  const { data: timeline, loading: timelineLoading } = useAsyncData(
    () => fetchApplicationTimeline(userId, openApplicationId),
    [userId, openApplicationId],
  )

  // ADR-013 on-demand prep: the dashboard owns the prepared-applications list +
  // the prepare() action; the JD drawer renders the Prepare CTA / review surface.
  // The open job's prepared row is matched by job_ref.source_url — dashboard
  // JobMatch ids are application ids (not jobs ids), so prep is keyed by posting
  // URL and job_id is always null (sending an app id would break the jobs FK).
  const preparedApps = usePreparedApplications()
  const openSource = openJob?.sourceUrl ?? null
  const [justPreparedBySource, setJustPreparedBySource] = useState<Record<string, string>>({})
  const preparedIdForOpen = ((): string | null => {
    if (!openSource) return null
    if (justPreparedBySource[openSource]) return justPreparedBySource[openSource]
    const match = preparedApps.items.find(
      (p) => (p.job_ref as { source_url?: string } | null)?.source_url === openSource,
    )
    return match?.id ?? null
  })()

  const prepareOpenJob = () => {
    const j = openJob
    if (!j) return
    if (!j.sourceUrl) {
      toast('No source link to prepare from', 'circle-alert', 'var(--bkt-warning)')
      return
    }
    const source = j.sourceUrl
    preparedApps
      .prepare({
        job: { url: source, title: j.title },
        jobId: null,
        mode: reviewMode === 'auto' ? 'auto' : 'hybrid',
        matchScore: typeof j.score === 'number' ? j.score : undefined,
      })
      .then((res) => {
        setJustPreparedBySource((m) => ({ ...m, [source]: res.prepared_application_id }))
        const gated = res.fields.filter((f) => f.review_gate).length
        const tail =
          res.status === 'needs_review'
            ? ' — needs your review'
            : gated > 0
              ? ` — ${gated} to review`
              : ''
        toast(`Prepared ${j.company}${tail}`, 'circle-check', 'var(--bkt-success)')
      })
      .catch((e: unknown) => {
        toast(e instanceof Error ? e.message : 'Could not prepare this application', 'circle-alert', 'var(--bkt-danger)')
      })
  }

  // ── Auto-Search config (migrated from /prospector, ADR-016) ──
  const handleSaveProfile = useCallback(
    async (values: ProspectorFormValues) => {
      await upsertProfile({
        job_titles: values.jobTitles,
        locations: values.locations,
        job_types: values.jobTypes,
        environments: values.environments,
        min_salary: values.minSalary,
        keywords: values.keywords,
        is_active: prospectorProfile?.is_active ?? false,
      })
      toast('Search profile saved', 'circle-check', 'var(--bkt-success)')
    },
    [upsertProfile, prospectorProfile, toast],
  )

  // ── Score unscored inbox jobs (migrated, ADR-016) ──
  // Sequential per BR-052/BR-104 cost-cap; each runScoreForJob is timeout-bounded
  // in scoreJobFitWithLlm so the batch can't hang. Graduates ≥60 matches after.
  const scoreTargets = jobs.filter((j) => j.jobId != null && j.scoreSource === undefined)
  const handleScoreInbox = async () => {
    if (!userId || isScoring) return
    const targets = jobs.filter((j) => j.jobId != null && j.scoreSource === undefined)
    if (targets.length === 0) return
    setIsScoring(true)
    toast(`Scoring ${targets.length} ${targets.length === 1 ? 'job' : 'jobs'}…`, 'sparkles', 'var(--bkt-blue-300)')
    let saved = 0
    let failed = 0
    for (const j of targets) {
      const jobId = j.jobId
      if (!jobId) continue
      try {
        await runScoreForJob({ userId, jobId, prospectorProfile })
        saved += 1
      } catch {
        failed += 1
      }
    }
    // Graduate freshly-scored ≥60 matches into the pipeline (idempotent, mode-aware).
    try {
      await graduateProspectorMatches({ userId, reviewMode })
    } catch {
      // Non-fatal — scores still landed; the inbox refetch reflects them.
    }
    reload()
    toast(
      failed > 0 ? `Scored ${saved} · ${failed} failed` : `Scored ${saved} ${saved === 1 ? 'job' : 'jobs'}`,
      failed > 0 ? 'circle-alert' : 'circle-check',
      failed > 0 ? 'var(--bkt-warning)' : 'var(--bkt-success)',
    )
    setIsScoring(false)
  }

  // ── Graduate already-scored matches once per mount (migrated, ADR-016) ──
  // Prospector jobs scored in earlier sessions never created applications, so the
  // Review Matches inbox could miss strong matches; this backfills them on mount.
  const graduatedRef = useRef(false)
  useEffect(() => {
    if (!userId || graduatedRef.current) return
    graduatedRef.current = true
    graduateProspectorMatches({ userId, reviewMode })
      .then((result) => {
        if (result.created > 0) {
          reload()
          toast(
            `${result.created} ${result.created === 1 ? 'match' : 'matches'} added to your pipeline`,
            'circle-check',
            'var(--bkt-success)',
          )
        }
      })
      .catch(() => undefined)
  }, [userId, reviewMode, reload, toast])

  return (
    <>
      <TopBar
        credits={credits}
        onBudget={() => setBudgetOpen(true)}
        onGetCredits={() => {
          setCredits((c) => c + 25)
          toast('25 free credits added', 'gift', 'var(--bkt-blue-300)')
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24, padding: isMobile ? '6px 16px 0' : '6px 28px 0' }}>
        <ModeTabs mode={mode} setMode={setMode} reviewCount={reviewCount} />
        <div style={{ flex: 1 }}></div>
        <ReviewModeMenu
          value={reviewMode}
          onChange={(m) => {
            setReviewMode(m)
            toast(`Switched to ${REVIEW_MODES.find((x) => x.id === m)?.label ?? m}`, 'settings-2', 'var(--bkt-blue-300)')
          }}
        />
      </div>
      {mode === 'jobs' && (
        // On mobile: 16px side padding (matches JobsScreen's content inset so the
        // row's edges line up with the stat cards below) + each button flex:1, so
        // the two sit as equal 50% halves flush to both edges. Desktop unchanged.
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 16px 0' : '10px 28px 0', flexWrap: 'wrap' }}>
          <BktButton
            variant="outline"
            size="sm"
            iconLeft={<Icon name={configOpen ? 'chevron-down' : 'sliders-horizontal'} size={14} />}
            onClick={() => setConfigOpen((o) => !o)}
            style={isMobile ? { flex: 1 } : undefined}
          >
            Search Profile
          </BktButton>
          {scoreTargets.length > 0 && (
            <BktButton
              variant="outline"
              size="sm"
              iconLeft={<Icon name="sparkles" size={14} />}
              onClick={handleScoreInbox}
              disabled={isScoring}
              style={isMobile ? { flex: 1 } : undefined}
            >
              {isScoring ? 'Scoring…' : `Score ${scoreTargets.length} ${scoreTargets.length === 1 ? 'job' : 'jobs'}`}
            </BktButton>
          )}
        </div>
      )}
      {mode === 'jobs' && configOpen && (
        <div style={{ padding: '10px 28px 0' }}>
          <BktCard radius="xl">
            <ProspectorProfileForm
              key={prospectorProfile?.id ?? 'new'}
              profile={prospectorProfile}
              isSaving={profileSaving}
              onSave={handleSaveProfile}
            />
          </BktCard>
        </div>
      )}
      <div key={mode} className="bkt-blur-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 14 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', font: '400 var(--text-sm)/1 var(--font-body)' }}>
            Loading your pipeline…
          </div>
        ) : mode === 'jobs' ? (
          <JobsScreen
            jobs={jobs}
            stats={{ submitted, matches }}
            selectedId={openId}
            paused={!searchActive}
            searching={searching}
            onTogglePause={toggleSearch}
            onOpenJob={setOpenId}
            onApply={apply}
            onDecline={decline}
            onViewApplication={viewApplication}
            onRefresh={reload}
          />
        ) : (
          <QuickReview jobs={jobs} onApply={apply} onDecline={decline} />
        )}
      </div>
      <JDSidebar
        job={openJob}
        onClose={() => setOpenId(null)}
        onApply={apply}
        onDecline={decline}
        auditEvents={timeline ?? []}
        auditLoading={timelineLoading}
        onPrepare={prepareOpenJob}
        preparing={preparedApps.preparing}
        preparedApplicationId={preparedIdForOpen}
      />
      <BudgetModal
        open={budgetOpen}
        budget={budget}
        onClose={() => setBudgetOpen(false)}
        onSave={(n) => {
          setBudget(n)
          setBudgetOpen(false)
          toast(`Monthly budget set to $${n}`, 'badge-dollar-sign', 'var(--bkt-blue-300)')
        }}
      />
    </>
  )
}
