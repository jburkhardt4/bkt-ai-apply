# Prospector UI Spec — Implemented

**feature:** F-017 — Automated Job Prospector
**status:** IMPLEMENTED — fully built and shipped
**spec_date:** 2026-06-07
**implemented_date:** 2026-06-07
**authored_by:** Ui-Ux Agent (dispatched by Orchestrator WO-20260607-automated-job-prospector)
**depends_on:** docs/prd.md §27, docs/domain/business-rules.md BR-100 through BR-107

> **Implementation note:** Navigation is registered in the redesigned `AppShell.tsx`
> (sidebar nav key `'prospector'`) and in `src/App.tsx`'s `RoutedPage` switch. The
> original `AppSidebar.tsx` referenced below was replaced by the UI/UX redesign
> (AppShell + AutoApplySidebar). The Prospector feature surface (`src/features/jobs/`)
> and page (`src/pages/ProspectorPage.tsx`) are fully implemented.

---

## 1. Navigation Placement

### Primary Nav Item

Add "Prospector" as the **third item** in `AppSidebar.tsx` `NAV_ITEMS` array, after "Ingestion".

```text
Position in NAV_ITEMS:
  [0] Dashboard    — /          — LayoutDashboard icon
  [1] Ingestion    — /ingestion — Upload icon
  [2] Prospector   — /prospector — Search icon (lucide-react: Search)
```

**Icon recommendation:** `Search` from `lucide-react`. Rationale: search/discovery is the prospector's core action; the icon is immediately legible at 16px, distinct from the existing set, and already available in the bundle (lucide-react is installed).

**Label:** `Prospector`

**Active state:** same pattern as existing items — `bg-primary text-primary-foreground shadow-sm` when `currentPath.startsWith('/prospector')`.

### Route Registration

Add `/prospector` to `src/App.tsx` route switch. The Prospector page component lives at `src/pages/ProspectorPage.tsx` and delegates to `src/features/jobs/ProspectorDashboard.tsx`.

---

## 2. Route

`/prospector` — protected route (requires auth via AppShell pattern; unauthenticated users redirect to `/login` via existing AppShell logic).

---

## 3. Configuration Dashboard — `/prospector`

### 3.1 Page Layout (Desktop)

```text
┌─────────────────────────────────────────────────────────┐
│  Prospector                               [Enable toggle]│
│  Configure your automated job search                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Search Profile ─────────────────────────────────┐   │
│  │  Job Title *         [________________________]   │   │
│  │  Location            [________________________]   │   │
│  │  Job Type *          [full-time ▼]               │   │
│  │  Environment *       [remote ▼]                  │   │
│  │  Salary Range        [$______] – [$______]        │   │
│  │  Skills / Keywords   [tag input — up to 20 tags] │   │
│  │                                                   │   │
│  │  [Save Profile]                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Run Status ────────────────────────────────────┐    │
│  │  Last run:    2026-06-07 at 6:00 AM              │    │
│  │  Next run:    2026-06-07 at 6:00 PM              │    │
│  │  [Run Now]  (available even when toggle is off)  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Ready to Apply ────────────────────────────────┐    │
│  │  3 matches found                                 │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │  Senior PM @ Acme Corp        [92]  [→]  │    │    │
│  │  │  Product Lead @ Beta Inc      [78]  [→]  │    │    │
│  │  │  Program Manager @ Gamma LLC  [63]  [→]  │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Page Layout (Mobile)

On mobile (below `md` breakpoint), the page is a single scrollable column. All three sections stack vertically: Search Profile card → Run Status card → Ready to Apply card. The Enable toggle moves inline below the page heading.

> **Update (ADR-018, 2026-06-26):** an earlier draft of this spec assumed an
> "AppShell mobile nav Sheet pattern" existed — it did not. Mobile navigation
> is now provided by the responsive shell shipped in ADR-018: under 768px
> `AppShell` renders a `MobileTopBar` (hamburger) + a left slide-in nav drawer,
> gated on `useIsMobile()`. No page-level Sheet is required for this page.

---

## 4. Component Breakdown

### 4.1 `ProspectorPage` (src/pages/ProspectorPage.tsx)

- Route entry point. Thin — delegates to `ProspectorDashboard`.
- Renders inside `AppShell`.

### 4.2 `ProspectorDashboard` (src/features/jobs/ProspectorDashboard.tsx)

Container component. Owns the page-level layout. Responsibilities:

- Fetches `prospecting_profiles` row for `auth.uid()` via `src/lib/supabase.ts`
- Fetches `prospecting_runs` most-recent row for `last_run_at`
- Passes data to child components as props
- No inline data fetching in child components (presentational contract from CLAUDE.md)

### 4.3 `ProspectorProfileForm` (src/features/jobs/components/ProspectorProfileForm.tsx)

Presentational form component. Props:

```typescript
interface ProspectorProfileFormProps {
  profile: ProspectingProfile | null    // null = no profile yet
  isSaving: boolean
  onSave: (values: ProspectorFormValues) => void
}
```

Contains all search parameter inputs (see §5 for input specifications).

### 4.4 `ProspectorToggle` (src/features/jobs/components/ProspectorToggle.tsx)

Presentational toggle. Props:

```typescript
interface ProspectorToggleProps {
  isActive: boolean
  isUpdating: boolean
  onToggle: (active: boolean) => void
}
```

Renders a labeled `Switch` (from `@/components/ui/switch`) with text "Automated search is ON / OFF". Visually prominent — positioned in the page header area.

### 4.5 `ProspectorRunStatus` (src/features/jobs/components/ProspectorRunStatus.tsx)

Presentational run status card. Props:

```typescript
interface ProspectorRunStatusProps {
  lastRunAt: string | null     // ISO timestamptz
  nextRunAt: string | null     // ISO timestamptz
  isRunning: boolean
  onRunNow: () => void
}
```

Displays formatted dates (locale-aware). "Run Now" button is always available regardless of `is_active` state (per BR-107).

### 4.6 `ProspectorReadyQueue` (src/features/jobs/components/ProspectorReadyQueue.tsx)

Presentational list of matched jobs. Props:

```typescript
interface ProspectorReadyQueueProps {
  jobs: ProspectorJobMatch[]   // match_score >= 60, source = 'prospector'
  isLoading: boolean
}

interface ProspectorJobMatch {
  id: string
  title: string
  company_name: string
  match_score: number
  application_id: string | null
}
```

Each row shows: job title, company name, score badge, and a navigate-to-application arrow link.

---

## 5. Input Specifications

### Job Title

- Input type: `<input type="text">`
- Placeholder: "e.g. Product Manager"
- Required. Shows inline validation error if empty on save attempt.
- Max length: 200 characters.

### Location

- Input type: `<input type="text">`
- Placeholder: "e.g. San Francisco, CA or Remote"
- Optional.
- Max length: 200 characters.

### Job Type

- Input type: `<select>` (shadcn/ui `Select` component)
- Options: `Full-time`, `Contract`, `Part-time`
- Maps to DB values: `full-time`, `contract`, `part-time`
- Required. Default: `Full-time`.

### Environment

- Input type: `<select>` (shadcn/ui `Select` component)
- Options: `Remote`, `Hybrid`, `In-office`
- Maps to DB values: `remote`, `hybrid`, `in-office`
- Required. Default: `Remote`.

### Salary Range

- Two `<input type="number">` fields: Min and Max.
- Optional. When both are populated, validate `salary_min <= salary_max` client-side.
- Inline error: "Minimum salary must be less than or equal to maximum salary."
- Display as formatted currency (no decimals): `$120,000`.
- Min value: 0.

### Skills / Keywords

- Multi-tag input component.
- Pattern: text input with Enter/comma to commit a tag; X button to remove.
- Max 20 tags (BR-105 / AC-016-03). When 20 tags are present, input is disabled with tooltip: "Maximum 20 skills reached."
- Each tag max 50 characters.
- Tags render as inline `Badge` components (shadcn/ui `Badge`, variant `secondary`).

---

## 6. State Shape

The `ProspectorDashboard` component owns local state. The following shape is the contract for implementation:

```typescript
interface ProspectorPageState {
  // Profile data
  profile: ProspectingProfile | null
  isProfileLoading: boolean
  isSaving: boolean

  // Toggle
  isActive: boolean
  isTogglingActive: boolean

  // Run status
  lastRunAt: string | null
  nextRunAt: string | null
  isRunning: boolean

  // Ready to Apply queue
  queuedJobs: ProspectorJobMatch[]
  isQueueLoading: boolean
}
```

All DB reads go through `src/lib/supabase.ts`. No data fetching inside presentational components.

---

## 7. Tailwind CSS v4 Class Strategy

All classes use Tailwind v4 design tokens. No arbitrary values are used (per CLAUDE.md non-negotiable for Tailwind v4).

### Section Cards

```text
rounded-xl border border-border bg-card p-6 shadow-sm
```

### Page Header

```text
flex items-center justify-between mb-6
```

### Page Title

```text
text-2xl font-semibold tracking-tight text-foreground
```

with `font-family: var(--font-display)` inline style (matching existing AppShell pattern).

### Score Badge (Ready to Apply queue)

- score >= 80: `bg-green-500/15 text-green-700 dark:text-green-400`
- score 60–79: `bg-amber-500/15 text-amber-700 dark:text-amber-400`
- score < 60: never shown in this queue (filtered by BR-105)

Badge class base: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold`

### Form Labels

```text
text-sm font-medium text-foreground mb-1.5 block
```

### Save Button

```text
variant="default" — maps to bg-primary text-primary-foreground
```

### Run Now Button

```text
variant="outline" size="sm"
```

### Enable Toggle label states

- Active: `text-sm font-medium text-foreground`
- Inactive: `text-sm font-medium text-muted-foreground`

---

## 8. Responsive Behavior

| Breakpoint | Behavior |
| --- | --- |
| `< md` (mobile) | Single column; sections stack vertically; AppShell mobile Sheet nav; no right chat sidebar |
| `>= md` (desktop) | Two-column feel: left nav sidebar (w-56) + main content area + right chat sidebar (resizable, default 320px) |

The Prospector page does not require a dedicated mobile Sheet or drawer. The standard AppShell layout handles mobile navigation.

The `ProspectorReadyQueue` job list uses a stacked card layout on mobile (full-width rows) and a compact table-like row layout on desktop.

---

## 9. Empty States

### No Profile Configured

When `profile === null`, the `ProspectorProfileForm` renders with empty/default field values and a helper text: "Set up your search profile to start discovering jobs automatically."

### No Queue Results

When `queuedJobs.length === 0` and the profile has run at least once, render:

```text
No matches yet. Your next run is scheduled for [nextRunAt].
```

When `queuedJobs.length === 0` and no run has occurred:

```text
Your prospector hasn't run yet. Save your profile and enable automated search to get started.
```

### Profile Never Saved

The Save button is labeled "Save Profile" on first save and "Update Profile" on subsequent saves (determined by whether `profile` is null).

---

## 10. Cross-References

| Concern | Reference |
| --- | --- |
| Score threshold for queue | BR-105, BR-020 |
| Enable/disable toggle behavior | BR-107, BR-100 |
| Deduplication (not surfaced in UI, but must not show dupes) | BR-102, BR-063 |
| Max skills constraint | AC-016-03 |
| Salary validation | AC-016-02 |
| Run Now available when inactive | BR-107, AC-017-03 |
| All DB reads via single Supabase client | BR-004 |
| Auth context for user_id scoping | BR-005, BR-008 |
| feature_directory | src/features/jobs/ (matches CLAUDE.md source directory contract) |
