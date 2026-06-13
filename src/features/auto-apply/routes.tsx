// BKT AI-Apply — route components for the redesigned surface.
// Each route owns its data loading + the cross-screen actions that the
// design kit's single-page App coordinated (auto-apply from Search/Saved,
// save/un-save, last-target tracking for the document writer).
//
// Phase 2 data backbone: Search/Saved now load real `jobs`/`saved_jobs`
// rows and their actions create real `applications`/`saved_jobs` rows.
// When Supabase is unconfigured or the user has no rows yet the services
// return `source:'demo'` and the routes fall back to the original
// localStorage overlay so the design-review UAT stays fully interactive.
import { useState } from 'react'
import { useBktToast } from '@/components/bkt/toast-context'
import { useAuth } from '@/contexts/auth-context'
import {
  autoApplyToJob,
  fetchInbox,
  fetchSavedJobs,
  fetchSearchBoard,
  saveJob,
  unsaveJob,
  type SearchBoard,
} from './services/autoApplyService'
import { useAsyncData } from './hooks/useAutoApplyData'
import {
  useAppliedSearchIds,
  useCredits,
  useLastTarget,
  useRemovedSeedSavedIds,
  useSavedSearchIds,
} from './state'
import { SEARCH_SEED } from './data/searchData'
import { SAVED_SEED } from './data/savedData'
import { DOCS_SEED } from './data/docsData'
import { INBOX_SEED } from './data/inboxData'
import { InboxScreen } from './screens/InboxScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SavedScreen } from './screens/SavedScreen'
import { DocsHome } from './screens/DocsScreen'
import { JDSidebar } from './screens/JDSidebar'
import type { DocType } from './screens/DocPaper'
import type { SavedJob, SearchJob } from './types'

export function InboxRoute() {
  const toast = useBktToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { data, reload } = useAsyncData(() => fetchInbox(userId), [userId])
  return (
    <InboxScreen
      data={data?.inbox ?? INBOX_SEED}
      onToast={toast}
      dateOrder="mdy"
      onRefresh={reload}
      live={data?.source === 'live'}
    />
  )
}

/** A posting → the last-target shape consumed by the document writer. */
function toLastTarget(job: SearchJob | SavedJob): SearchJob {
  return {
    id: String(job.id),
    company: job.company ?? '',
    industry: ('industry' in job && job.industry) || '',
    posted: ('posted' in job && job.posted) || 'Just now',
    chips: job.chips ?? [],
    score: ('score' in job && job.score) || 0,
    title: job.title,
    domain: job.domain,
    skills: job.skills,
    level: job.level,
    location: job.location,
    overview: job.overview,
  }
}

/** Demo-mode (no Supabase / no rows) local overlay — preserves the original
 *  localStorage behavior so the design-review UAT stays fully interactive. */
function useDemoBoardActions() {
  const toast = useBktToast()
  const [, setCredits] = useCredits()
  const [appliedIds, setAppliedIds] = useAppliedSearchIds()
  const [savedIds, setSavedIds] = useSavedSearchIds()
  const [, setLastTarget] = useLastTarget()

  const autoApply = (job: SearchJob | SavedJob) => {
    setAppliedIds((ids) => (ids.includes(String(job.id)) ? ids : [...ids, String(job.id)]))
    if (job.title && job.company) setLastTarget(toLastTarget(job))
    setCredits((c) => Math.max(0, c - 1))
    toast(`Application queued — ${job.company ?? job.title}`, 'circle-check', 'var(--bkt-success)')
  }

  const toggleSave = (job: SearchJob) => {
    setSavedIds((ids) => {
      if (ids.includes(job.id)) {
        toast(`Removed from Saved Jobs — ${job.company}`, 'bookmark', 'var(--bkt-blue-300)')
        return ids.filter((id) => id !== job.id)
      }
      toast(`Saved — ${job.company}`, 'bookmark-check', 'var(--bkt-blue-300)')
      return [...ids, job.id]
    })
  }

  return { appliedSet: new Set(appliedIds), savedSet: new Set(savedIds), savedIds, autoApply, toggleSave }
}

export function SearchRoute() {
  const toast = useBktToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { data, reload } = useAsyncData(() => fetchSearchBoard(userId), [userId])
  const board: SearchBoard = data ?? { source: 'demo', jobs: SEARCH_SEED.jobs, appliedIds: [], savedIds: [] }
  const live = board.source === 'live'

  const demo = useDemoBoardActions()
  const [, setCredits] = useCredits()
  const [, setLastTarget] = useLastTarget()
  const [searchJob, setSearchJob] = useState<SearchJob | null>(null)

  const appliedSet = live ? new Set(board.appliedIds) : demo.appliedSet
  const savedSet = live ? new Set(board.savedIds) : demo.savedSet

  const toggleSave = (job: SearchJob) => {
    if (!live) return demo.toggleSave(job)
    if (!userId) return
    const isSaved = savedSet.has(job.id)
    const action = isSaved ? unsaveJob(userId, job.id) : saveJob(userId, job.id)
    action.then(reload).catch((err: unknown) => toast(`Could not update Saved Jobs — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
    toast(
      isSaved ? `Removed from Saved Jobs — ${job.company}` : `Saved — ${job.company}`,
      isSaved ? 'bookmark' : 'bookmark-check',
      'var(--bkt-blue-300)',
    )
  }

  const autoApply = (job: SearchJob | SavedJob) => {
    if (!live) return demo.autoApply(job)
    if (!userId) return
    if (job.title && job.company) setLastTarget(toLastTarget(job))
    autoApplyToJob(userId, String(job.id))
      .then((res) => {
        if (res.applied) {
          setCredits((c) => Math.max(0, c - 1))
          reload()
        }
      })
      .catch((err: unknown) => toast(`Auto-apply failed — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
    toast(`Application queued — ${job.company ?? job.title}`, 'circle-check', 'var(--bkt-success)')
  }

  return (
    <>
      <SearchScreen
        data={{ ...SEARCH_SEED, jobs: board.jobs }}
        appliedIds={appliedSet}
        saved={savedSet}
        onToggleSave={toggleSave}
        onShowDetails={setSearchJob}
        onAutoApply={autoApply}
        onToast={toast}
      />
      <JDSidebar
        job={searchJob}
        onClose={() => setSearchJob(null)}
        onApply={() => {
          if (searchJob && !appliedSet.has(searchJob.id)) autoApply(searchJob)
        }}
        onDecline={() => {
          if (searchJob) toast(`Declined — ${searchJob.company}`, 'circle-x', 'var(--bkt-danger)')
        }}
      />
    </>
  )
}

export function SavedRoute() {
  const toast = useBktToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { data, reload } = useAsyncData(() => fetchSavedJobs(userId), [userId])
  const live = data?.source === 'live'

  const demo = useDemoBoardActions()
  const [removedSeedIds, setRemovedSeedIds] = useRemovedSeedSavedIds()
  const [, setSavedIds] = useSavedSearchIds()
  const [, setCredits] = useCredits()
  const [, setLastTarget] = useLastTarget()

  const demoSavedList: SavedJob[] = [
    ...SEARCH_SEED.jobs
      .filter((j) => demo.savedIds.includes(j.id))
      .map((j) => ({ ...j, allChips: j.skills ?? j.chips, desc: j.overview ?? '', saved: 'Just now' })),
    ...SAVED_SEED.jobs.filter((j) => !removedSeedIds.includes(j.id)),
  ]
  const savedList = live ? data?.jobs ?? [] : demoSavedList

  const deleteSaved = (job: SavedJob) => {
    if (live && userId) {
      unsaveJob(userId, String(job.id))
        .then(reload)
        .catch((err: unknown) => toast(`Could not remove — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
    } else if (SAVED_SEED.jobs.some((j) => j.id === job.id)) {
      setRemovedSeedIds((ids) => [...ids, job.id])
    } else {
      setSavedIds((ids) => ids.filter((id) => id !== job.id))
    }
    toast(`Removed from Saved Jobs — ${job.company || job.title}`, 'trash-2', 'var(--bkt-zinc-300)')
  }

  const autoApply = (job: SearchJob | SavedJob) => {
    if (!live || !userId) return demo.autoApply(job)
    if (job.title && job.company) setLastTarget(toLastTarget(job))
    autoApplyToJob(userId, String(job.id))
      .then((res) => {
        if (res.applied) {
          setCredits((c) => Math.max(0, c - 1))
          reload()
        }
      })
      .catch((err: unknown) => toast(`Auto-apply failed — ${String(err)}`, 'circle-x', 'var(--bkt-danger)'))
    toast(`Application queued — ${job.company ?? job.title}`, 'circle-check', 'var(--bkt-success)')
  }

  return (
    <SavedScreen
      jobs={savedList}
      appliedIds={live ? new Set<string>() : demo.appliedSet}
      onDelete={deleteSaved}
      onAutoApply={autoApply}
      onToast={toast}
    />
  )
}

export function DocsRoute({ type }: { type: DocType }) {
  const toast = useBktToast()
  const { user } = useAuth()
  const [lastTarget] = useLastTarget()
  return (
    <DocsHome
      type={type}
      docs={DOCS_SEED}
      userId={user?.id ?? null}
      lastJob={lastTarget}
      dateOrder="mdy"
      aiVariant="rail"
      onToast={toast}
    />
  )
}
