// BKT AI-Apply — route components for the redesigned surface.
// Each route owns its data loading + the cross-screen actions that the
// design kit's single-page App coordinated (auto-apply from Search/Saved,
// save/un-save, last-target tracking for the document writer).
import { useState } from 'react'
import { useBktToast } from '@/components/bkt/toast-context'
import { useAuth } from '@/contexts/auth-context'
import { fetchInbox } from './services/autoApplyService'
import { useAsyncData } from './hooks/useAutoApplyData'
import {
  useAppliedSearchIds,
  useCredits,
  useLastTarget,
  useRemovedSeedSavedIds,
  useSavedSearchIds,
  useSubmittedDelta,
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
  return <InboxScreen data={data?.inbox ?? INBOX_SEED} onToast={toast} dateOrder="mdy" onRefresh={reload} />
}

/** Shared auto-apply action used by Search + Saved. */
function useAutoApplyAction() {
  const toast = useBktToast()
  const [, setCredits] = useCredits()
  const [, setSubmittedDelta] = useSubmittedDelta()
  const [appliedIds, setAppliedIds] = useAppliedSearchIds()
  const [, setLastTarget] = useLastTarget()

  const autoApply = (job: SearchJob | SavedJob) => {
    setAppliedIds((ids) => (ids.includes(job.id as string) ? ids : [...ids, job.id as string]))
    if (job.title && job.company) {
      setLastTarget({
        id: String(job.id),
        company: job.company,
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
      })
    }
    setSubmittedDelta((n) => n + 1)
    setCredits((c) => Math.max(0, c - 1))
    toast(`Application queued — ${job.company ?? job.title}`, 'circle-check', 'var(--bkt-success)')
  }

  return { appliedIds: new Set(appliedIds), autoApply }
}

export function SearchRoute() {
  const toast = useBktToast()
  const { appliedIds, autoApply } = useAutoApplyAction()
  const [savedIds, setSavedIds] = useSavedSearchIds()
  const [searchJob, setSearchJob] = useState<SearchJob | null>(null)

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

  return (
    <>
      <SearchScreen
        data={SEARCH_SEED}
        appliedIds={appliedIds}
        saved={new Set(savedIds)}
        onToggleSave={toggleSave}
        onShowDetails={setSearchJob}
        onAutoApply={autoApply}
        onToast={toast}
      />
      <JDSidebar
        job={searchJob}
        onClose={() => setSearchJob(null)}
        onApply={() => {
          if (searchJob && !appliedIds.has(searchJob.id)) autoApply(searchJob)
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
  const { appliedIds, autoApply } = useAutoApplyAction()
  const [savedIds, setSavedIds] = useSavedSearchIds()
  const [removedSeedIds, setRemovedSeedIds] = useRemovedSeedSavedIds()

  const savedList: SavedJob[] = [
    ...SEARCH_SEED.jobs
      .filter((j) => savedIds.includes(j.id))
      .map((j) => ({ ...j, allChips: j.skills ?? j.chips, desc: j.overview ?? '', saved: 'Just now' })),
    ...SAVED_SEED.jobs.filter((j) => !removedSeedIds.includes(j.id)),
  ]

  const deleteSaved = (job: SavedJob) => {
    if (SAVED_SEED.jobs.some((j) => j.id === job.id)) setRemovedSeedIds((ids) => [...ids, job.id])
    else setSavedIds((ids) => ids.filter((id) => id !== job.id))
    toast(`Removed from Saved Jobs — ${job.company || job.title}`, 'trash-2', 'var(--bkt-zinc-300)')
  }

  return <SavedScreen jobs={savedList} appliedIds={appliedIds} onDelete={deleteSaved} onAutoApply={autoApply} onToast={toast} />
}

export function DocsRoute({ type }: { type: DocType }) {
  const toast = useBktToast()
  const [lastTarget] = useLastTarget()
  return <DocsHome type={type} docs={DOCS_SEED} lastJob={lastTarget} dateOrder="mdy" aiVariant="rail" onToast={toast} />
}
