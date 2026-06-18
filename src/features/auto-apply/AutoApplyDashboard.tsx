// BKT AI-Apply — Auto Apply dashboard: TopBar + mode tabs (Quick Review /
// Your Jobs) + review-mode menu + JD sidebar + budget modal.
// Orchestration ported from the design-system UI kit's index.html App.
// Data comes from useJobMatches (live Supabase rows when configured,
// design-system seeds otherwise); Apply/Decline write event-sourced stage
// transitions in live mode.
import { useState } from 'react'
import { useBktToast } from '@/components/bkt/toast-context'
import { useAuth } from '@/contexts/auth-context'
import {
  applyToJob,
  declineJob,
  fetchApplicationTimeline,
  fetchJobMatches,
  markManualApplied,
  markManualInProgress,
} from './services/autoApplyService'
import { openSourceUrl } from './openSourceUrl'
import { fetchSubmittedCount } from '@/features/applications/services/applicationService'
import { useProspectorProfile } from '@/features/jobs/hooks/useProspectorProfile'
import { triggerProspectorRun } from '@/features/jobs/services/prospectorRunService'
import { useAsyncData } from './hooks/useAutoApplyData'
import { useBudget, useCredits, useReviewMode } from './state'
import { JOBS_SEED } from './data/jobsData'
import { BudgetModal, ModeTabs, ReviewModeMenu, TopBar } from './components/chrome'
import { REVIEW_MODES } from './reviewModes'
import { JobsScreen } from './screens/JobsScreen'
import { QuickReview } from './screens/QuickReview'
import { JDSidebar } from './screens/JDSidebar'
import type { JobMatch } from './types'

export function AutoApplyDashboard() {
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
  const { profile: prospectorProfile, toggleActive } = useProspectorProfile()
  const searchActive = prospectorProfile?.is_active ?? false
  const [searching, setSearching] = useState(false)

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
        applyToJob(j, userId)
          .then(() => reloadSubmitted())
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
      markManualInProgress(j, userId)
        .then(() => reload())
        .catch(() => undefined)
    }
  }

  const decline = (id: JobMatch['id']) => {
    const j = jobs.find((x) => x.id === id)
    if (!j) return
    setStatus(id, 'Declined')
    toast(`Declined — ${j.company}`, 'circle-x', 'var(--bkt-danger)')
    if (live) {
      declineJob(j, userId).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Stage transition failed', 'circle-alert', 'var(--bkt-danger)'))
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
    toggleActive(true)
    setSearching(true)
    toast('Searching now — scanning sources…', 'play', 'var(--bkt-blue-300)')
    triggerProspectorRun()
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '6px 28px 0' }}>
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
