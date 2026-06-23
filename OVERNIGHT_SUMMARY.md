# Overnight Remediation — Post-Audit Fixes + UI Consolidation (2026-06-23)

Executes the remediation plan in [`docs/qa/dashboard-uat-audit.md`](docs/qa/dashboard-uat-audit.md) §6
and the "Native Merge" UI consolidation. **Validation: `pnpm validate` green (888 tests, lint +
typecheck clean) · `pnpm build` green** (1987 modules; bundle shrank after the orphan sweep). Net diff:
**30 files, +532 / −4240**.

> Architecture decision honored: **Native Merge** — `/prospector` removed entirely; its rich
> affordances ported into the Dashboard. **The collapsible "Search Profile" panel is preserved**
> (`useProspectorProfile` + `ProspectorProfileForm` kept and still wired in `AutoApplyDashboard`).

---

## Phase 1 — HIGH-severity data regressions

### 1.1 — Inbox 100-row cap → true pagination

- `autoApplyService.fetchProspectInboxJobs` replaced the hard `.limit(100)` with a `.range()` sweep
  (page 200, safety bound 5000) that fetches **every** prospected/corpus job, then orders by match
  score desc. **No discovered job is unreachable anymore.** (`autoApplyService.ts`)
- Test mock updated to support `.range()` (`autoApplyService.test.ts`).

### 1.2 — Hard eligibility / location filter

- New **`eligibilityService.ts`** (pure, deterministic, **11 unit tests** in `eligibilityService.test.ts`):
  - `assessEligibility(job, profile)` → `block` (posting explicitly excludes US-based candidates —
    the Swans wall), `penalize` (foreign-located, no US-remote — the Plative/India case;
    `GEO_MISMATCH_PENALTY = 45`), or `ok`.
  - `deriveEligibilityProfile(candidate_profiles row)` — US-authorized from work-authorization /
    location; **defaults to NOT gating** when the profile is empty/unknown (never over-gates).
- Wired into the **ready-queue gate**: `prospectorGraduationService.applyEligibilityGate` drops
  `block` postings and any whose score − penalty falls below the 60 floor, **before** an application is
  created. **Fail-open** (a gate error never blocks legitimate graduation).

---

## Phase 2 — UI consolidation (MEDIUM regressions)

### 2.1 — Removed the temporary `/prospector` route + orphans

- Reverted the 4 route hooks (`router.ts`, `types.ts` NavKey, `App.tsx` import+case,
  `AutoApplySidebar.tsx` nav item).
- Deleted `ProspectorPage.tsx`, `ProspectorDashboard.tsx`, **12 orphaned leaf files** (search-results
  table, job sheet, ready-queue, run-status, toggle, job-fields + 6 hooks + seed data), and **2
  obsolete e2e specs**. Verified each was reachable only from the deleted pages; **kept** everything the
  Search Profile panel / run + graduation services depend on.

### 2.2 — Ported the rich table affordances into `JobsScreen`

- **Per-column filter dropdowns**: Type · Environment · Source (derived from the rows in view).
- **Functional Sort** (was a dead no-op): cycles Score ↓ / Score ↑ / Company.
- **Dropped fields surfaced**: `JobRow` now shows the **real board name** (Greenhouse / Ashby / Lever /
  Workday / LinkedIn …, via `boardFromUrl`) instead of a generic "Job Board" badge, plus **job-type ·
  environment** chips next to the title. (Match-score already rendered via `MatchScore`; salary =
  Compensation column; recency = Updated column, posted_at-derived for prospect rows.)
- Data plumbing: `JobMatch` + `mapProspectJob`/`mapApplication` + both selects now carry `jobType`,
  `remoteType`, `postedAt`, `sourceBoard`, `descriptionFormatted` (`types.ts`, `autoApplyService.ts`).

### 2.3 — Reconnected the formatted JD + real source badge

- `JDSidebar` Overview tab now renders `JobDescriptionMarkdown` from `descriptionFormatted` (falls back
  to the raw overview, or a "No description" state) — the formatted JD is reconnected.
- The hardcoded **"Review Matches"** header badge is replaced by the **real source board** (or "Job
  Board" for corpus) + the actual status chip.

### 2.4 — Dead Sort button + auth-hydration race

- Sort button wired (see 2.2).
- `AppShell` redirect guard now uses a **1200 ms grace window** so a late `INITIAL_SESSION` /
  token-refresh can cancel the bounce — deep-linking / refreshing a protected sub-route no longer
  races auth hydration into `/login`.

---

## Notes, scope decisions & follow-ups (honest)

- **Eligibility is a service-layer gate, not an Edge change.** The `score-job-fit` Edge Function is
  unchanged (Edge deploys are JB-gated and escape `pnpm validate`). The gate runs at graduation
  (dashboard mount + after scoring); it prevents *new* ineligible graduations but does **not**
  retroactively un-graduate applications created before this change — a one-off cleanup could follow.
- **Eligibility regexes are heuristic** — they catch the observed Swans (US-exclusion) and Plative
  (India) patterns and a conservative foreign-country list. Other phrasings may need tuning; the pure
  function + tests make that low-risk to extend.
- **Phase 2.2 is a pragmatic Native Merge**: job-type/environment/board are surfaced as inline chips +
  per-column filter dropdowns rather than a full discrete-column grid rewrite of the shared `JobRow`
  (lower risk, same information + filtering). A denser multi-column grid can be a follow-up if desired.
- **JD formatting is read-only here**: `JDSidebar` renders the cached `jobs.description_formatted` (or
  raw overview). It does **not** lazily call `format-jd` on open the way the old `ProspectorJobSheet`
  did; on-demand formatting for never-formatted rows is a possible follow-up.
- No DB migrations or generated-type changes. No commits/pushes beyond this branch.

## Blockers encountered

- None blocking. The graduation + autoApplyService test mocks needed updating for the new query shapes
  (`.range()`, the candidate_profiles eligibility read) — done; all 888 tests pass.
