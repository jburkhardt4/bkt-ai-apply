// BKT AI-Apply — Auto Apply dashboard: TopBar + mode tabs (Quick Review /
// Your Jobs) + review-mode menu + JD sidebar + budget modal.
// Orchestration ported from the design-system UI kit's index.html App.
// Data comes from useJobMatches (live Supabase rows when configured,
// design-system seeds otherwise); Apply/Decline write event-sourced stage
// transitions in live mode.
import { useState } from 'react'
import { useBktToast } from '@/components/bkt/toast-context'
import { useAuth } from '@/contexts/auth-context'
import { applyToJob, declineJob, fetchApplicationTimeline, fetchJobMatches } from './services/autoApplyService'
import { useAsyncData } from './hooks/useAutoApplyData'
import { useBudget, useCredits, usePaused, useReviewMode, useSubmittedDelta } from './state'
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
  const [overrides, setOverrides] = useState<Record<string, JobMatch['status']>>({})
  const jobs: JobMatch[] = (data?.jobs ?? []).map((j) => {
    const status = overrides[String(j.id)]
    return status ? { ...j, status, updated: 'Just now' } : j
  })
  const live = data?.source === 'live'

  const [mode, setMode] = useState<'review' | 'jobs'>('jobs')
  const [credits, setCredits] = useCredits()
  const [budget, setBudget] = useBudget()
  const [submittedDelta, setSubmittedDelta] = useSubmittedDelta()
  const [openId, setOpenId] = useState<JobMatch['id'] | null>(null)
  const [paused, setPaused] = usePaused()
  const [reviewMode, setReviewMode] = useReviewMode()
  const [budgetOpen, setBudgetOpen] = useState(false)

  const submitted = live ? jobs.filter((j) => j.status === 'Applied').length : JOBS_SEED.stats.submitted + submittedDelta
  const matches = live ? jobs.length : JOBS_SEED.stats.matches

  const setStatus = (id: JobMatch['id'], status: JobMatch['status']) => setOverrides((o) => ({ ...o, [String(id)]: status }))

  const apply = (id: JobMatch['id']) => {
    const j = jobs.find((x) => x.id === id)
    if (!j) return
    setStatus(id, 'Applied')
    setSubmittedDelta((n) => n + 1)
    setCredits((c) => Math.max(0, c - 1))
    toast(`Application queued — ${j.company}`, 'circle-check', 'var(--bkt-success)')
    if (live) {
      applyToJob(j, userId).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Stage transition failed', 'circle-alert', 'var(--bkt-danger)'))
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
            paused={paused}
            onTogglePause={() => {
              setPaused((p) => !p)
              toast(paused ? 'Auto Apply resumed' : 'Auto Apply paused', paused ? 'play' : 'pause', 'var(--bkt-blue-300)')
            }}
            onOpenJob={setOpenId}
            onApply={apply}
            onDecline={decline}
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
