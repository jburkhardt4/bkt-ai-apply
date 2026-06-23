# ADR-016: Consolidate the Prospector into the Dashboard ("Review Matches" inbox)

- **Status:** Accepted
- **Date:** 2026-06-23
- **Relates:** ADR-014/015 (shared corpus + crawler), BR-105 (Prospector source filter — amended), BR-020 (≥60 pipeline entry), BR-149 (manual source-link handoff), event-sourcing non-negotiable #4
- **Decided by:** JB, 2026-06-23

## Context

After ADR-014/015, crawled ATS postings (`jobs.source='corpus'`) and SerpApi discoveries
(`jobs.source='prospector'`) both land in the user-scoped `jobs` table. II.B broadened the three
Prospector data filters to `.in('source', ['prospector','corpus'])` so corpus jobs are visible, and
amended BR-105.

The standalone `/prospector` page duplicated job-search/review surfaces that already exist on the
main Dashboard (`/`). The Dashboard renders a `JobMatch[]` from `fetchJobMatches` (the `applications`
pipeline) and its "Review Matches" tab shows `status === 'Review'` — but that view was effectively
empty for prospected/crawled jobs because a `jobs` row only reaches it after being scored ≥60 and
**graduated** into a discovery-stage application. Raw prospected/corpus jobs (unscored or sub-60)
never appeared on the Dashboard at all; they lived only on `/prospector`.

JB's goal: **one surface.** Kill `/prospector`; make the Dashboard's "Review Matches" tab the
central inbox for everything the crawler/prospector finds, using the Dashboard's existing
Apply/Decline + JD-sidebar interaction model.

## Decision

**1. Native merge — prospected/corpus jobs become first-class `JobMatch` rows.** `fetchJobMatches`
(the Dashboard's only data source) now also fetches user-scoped `jobs` where
`source IN ('prospector','corpus')` that do **not** yet have an application, maps each to a `JobMatch`
(`status='Review'`, `stage='discovery'`, carrying `jobId` + `source`, `applicationId` undefined), and
merges them with the application-derived rows. Dedup is by `job_id`: a job that already has an
application appears once, as its application row (the real stage wins). They render through the
existing `JobRow`/JobsScreen "Review Matches" filter and open the same `JDSidebar`. Chosen over
(a) rendering the Prospector table in-tab and (b) a separate Search tab, because JB wants one unified
row + apply model, not two.

**2. Apply/Decline lazily create the application.** A prospected/corpus `JobMatch` has no
`applicationId`. On the first action the Dashboard calls `ensureApplicationForJob(userId, jobId)` —
a find-or-create of a `discovery` application (extracted from the existing `autoApplyToJob`
find-or-create) — then runs the **unchanged** transition path (`applyToJob` / `markManualInProgress` /
`markManualApplied` / `declineJob`). Every transition still writes `application_events` via
`transition_stage` (non-negotiable #4). Auto mode reuses `autoApplyToJob`.

**3. Auto-Search config moves onto the Dashboard.** The `ProspectorProfileForm` (job titles,
locations, environments, min-salary, keywords) renders as a collapsible "Search Profile" panel on the
Dashboard, wired to `useProspectorProfile` (already mounted there for Play/Pause). The Dashboard's
existing Play/Pause (`toggleSearch`) remains the run trigger; the graduation-on-mount effect and a
"Score unscored" control move from `ProspectorDashboard` to the Dashboard so the inbox self-curates.

**4. `/prospector` is removed.** Route + `NavKey` + sidebar entry deleted; `src/pages/ProspectorPage.tsx`
and `src/features/jobs/ProspectorDashboard.tsx` deleted. The Prospector leaf components/hooks that
only served that page (`ProspectorSearchResults`, `ProspectorReadyQueue`, `ProspectorRunStatus`,
`ProspectorToggle`, `ProspectorJobSheet`, `useProspectorSearchResults`, `useProspectorReadyQueue`,
`useProspectorTableControls`, `useProspectorColumnOrder`, `useProspectingRuns`, `prospectorJobFields`,
`summarizeRunResults`) are left orphaned in this pass and tracked for a follow-up dead-code sweep — to
keep this change's blast radius bounded. `useProspectorProfile`, `ProspectorProfileForm`,
`prospectorGraduationService`, and `prospectorRunService` stay (migrated/reused).

## Consequences

- **One inbox.** Crawled (Greenhouse/Ashby/Lever corpus) + SerpApi jobs + graduated matches all
  appear under Dashboard → Your Jobs → Review Matches, with a "Job Board" badge distinguishing corpus.
- **BR-105 semantics widen on the Dashboard:** "Review Matches" now shows un-graduated candidates too,
  not only scored-≥60 graduates. This is intentional (central inbox) and noted against BR-020 — the
  ≥60 gate still governs auto-submit/enqueue, only the *visibility* widens.
- **Lazy application creation** means opening/declining a raw prospected job now writes an
  `applications` row (+ event) on first action — previously those jobs had no pipeline footprint.
- **Orphaned Prospector leaf code** is dead until the follow-up sweep; it still compiles/tests green.
- Follow-ups: dead-code sweep of the orphaned leaves; optional richer ranking/sort of the merged
  inbox; revisit whether the separate auto-apply "Job Search" (`/search`) surface should fold in too.
