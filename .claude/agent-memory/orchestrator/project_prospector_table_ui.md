---
name: prospector-table-ui
description: ProspectorSearchResults dual-subtree responsive table; sort/filter/dismiss controls; animation technique; QA arbitrary-value grep protocol — updated 2026-06-08
metadata:
  type: project
---

ProspectorSearchResults was rewritten to a structured multi-column data table on 2026-06-08 (WO-20260608-prospector-table).

**Key architectural decision:** Two completely separate subtrees (`hidden md:table` and `md:hidden`) rather than responsive CSS hacks on `<table>` elements. This is because table-element responsive CSS is unreliable cross-browser.

**Why:** CSS `display` overrides on `<table>`, `<thead>`, `<tr>`, `<td>` conflict with browser UA stylesheets; the dual-subtree approach is more predictable and matches the design-taste-frontend MOBILE OVERRIDE rule.

**How to apply:** Any future responsive table/grid component in this codebase should use dual subtrees gated on `hidden md:block` and `md:hidden` rather than `@container` or responsive `display` hacks on table elements.

**Other patterns confirmed:**
- `formatJobType()` helper added to `prospectorJobFields.ts` — capitalizes job_type for display
- Sticky thead: `sticky top-0 z-10 bg-background/95 backdrop-blur-sm` on `<thead>` with `table-fixed border-separate border-spacing-0` on `<table>`
- `NullCell` component for recessed "—" / "Not Disclosed" placeholders (`select-none text-muted-foreground/40`)
- External link `<a>` always visible in the table column (no opacity-0 hide) — discoverability for keyboard users
- `<tr>` row click with `role="button"`, `tabIndex={0}`, `onKeyDown` Enter/Space handler for accessibility on table rows
- `prospector-row-enter` CSS stagger preserved exactly from original implementation

**Backend gap finding:** No schema changes required. All 7 required columns (Job Title, Company, Job Type, Environment, Salary, Date Posted, Job Link) map to existing `ProspectorSearchResult` fields. `formatCompensation` returns `null` (not "—") for both-null salary — handled at render layer with `NullCell label="Not Disclosed"`.

**Recommendation surfaced to JB:** Add `error?: string | null` to `ProspectorSearchResultsProps` in a follow-up ticket so the component can render an inline error banner. Currently the parent dashboard handles error display; the component has no error surface.

---

## Column reorder DnD expansion — 2026-06-08 (WO-20260608-prospector-dnd-columns)

**New file:** `src/features/jobs/hooks/useProspectorColumnOrder.ts`
**Updated file:** `src/features/jobs/components/ProspectorSearchResults.tsx`

**Column-definition model:** `ColumnDef` (id, label, sortKey?, widthClass, minWidthClass?, filterType) in `useProspectorColumnOrder.ts`. `COLUMN_DEFS` record is the single source of truth. `DEFAULT_COLUMN_ORDER: ColumnId[]` drives initial order.

**Default order (AC §2):** `['company', 'title', 'matchScore', 'jobType', 'environment', 'salary', 'posted']`

**DnD technique:** Native HTML5 `draggable` + `onDragStart/onDragOver/onDrop/onDragEnd`. `dragState` stored in `useRef` (not state) to avoid re-renders during drag. `dropIndicator` IS state (drives visual). No library added.

**Cursor behaviour:** `cursor-grab` on `.prospector-th-draggable:hover` (pointer-device media query). `.prospector-thead-dragging` sets `cursor: grabbing !important` on `<thead>` during drag so cursor persists when pointer moves off the element.

**Drop indicator:** CSS `box-shadow: inset 2px 0 0 hsl(var(--primary))` / `inset -2px 0 0` for left/right sides. Injected via `ProspectorRowStyles` — NOT arbitrary Tailwind bracket values.

**Snap animation:** `prospector-col-snap` keyframe (opacity 0.55 → 1, 120ms ease-out). Guards `prefers-reduced-motion`.

**localStorage:** Key `prospector_column_order_v1`. Validated on read (exact ColumnId set, no duplicates, correct length). Silent try/catch on write (private mode safe). Reset clears key and dispatches `RESET_ORDER`.

**Keyboard reorder:** `ArrowLeft` / `ArrowRight` on the sort button. NO animation (per emil-design-eng: don't animate keyboard-repeated actions). `aria-live="polite"` region announces position (e.g. "Company moved to position 2 of 7"). `Enter`/`Space` continues to sort.

**Reset affordance:** "Reset order" button (LayoutList icon) shown only when `isNonDefaultOrder === true`. Lives in the toolbar row alongside the Filters button.

**Column widths (AC §4):** Job Type `min-w-28` (7rem), Environment `min-w-24` (6rem). Applied to both `<th>` and `<td>` via `col.minWidthClass`. Standard Tailwind spacing tokens — zero arbitrary values.

**Label (AC §3):** `label: 'Match Score'` in `COLUMN_DEFS.matchScore`. Mobile card updated to "Match Score {n}".

**Action columns:** Link and Dismiss are `PinnedActionHeader` — separate from `orderedColumns`, always last, never draggable.

**Filter row:** `FilterCell` dispatcher replaces hardcoded filter cells. Maps `col.filterType` ('text' | 'select' | 'salary-range' | 'score' | 'none') to the correct control and correct `controls.filters` field.

**colSpan fix:** `colSpan={totalDataCols + 2}` on FilterEmptyState row (was hardcoded 9).

**Retry in this cycle:** Feature-Dev: unused `ColumnId` import (tsc) + redundant `toIndex` if/else (ESLint no-useless-assignment). Both fixed in second pass before Qa-Uat. No gate escalation.

**pnpm validate:** PASS (17 test files, 63 tests, zero type errors, zero lint warnings).
**Arbitrary-value grep:** ZERO hits.
**No new npm dependency** (package.json unchanged).

---

## Sort / Filter / Dismiss overhaul — 2026-06-08 (WO-20260608-prospector-table-overhaul)

**New file:** `src/features/jobs/hooks/useProspectorTableControls.ts`
**Updated file:** `src/features/jobs/components/ProspectorSearchResults.tsx`

**State shape:** `useProspectorTableControls(jobs)` takes raw jobs, returns `displayJobs` (sorted + filtered + hidden-excluded). Uses `useReducer` internally.

**Sort:** Single active column. Secondary tiebreak by `title` asc. `Array.prototype.sort` is stable in all modern engines. Nulls always sort last in both asc and desc — sentinel `+Infinity` before compareFn direction negation achieves this. Most user-friendly: known values always surface first.

**Null placement verified:** `(dir) => dir === 'asc' ? Infinity : -Infinity` sentinel with `sort.dir === 'desc' ? -c : c` produces nulls-last in both directions.

**Filter types:** title/company — text "contains" (case-insensitive). jobType/environment — exact select. salary — numeric range (both ends optional). Date Posted — not filterable (sort covers it).

**Dismiss / row removal:** In-memory `Set<string>` of hidden IDs. Local `localDismissed` state drives CSS class; hook state updated after 240ms delay matching CSS transition. `UndoBanner` auto-dismisses after 5s via `useEffect` timeout. "Show hidden (N)" restore button in count bar.

**Animation technique — no library:** CSS `max-h` + `opacity` transition. `max-h: 60px → 0` + `opacity: 1 → 0`, 220ms `cubic-bezier(0.23, 1, 0.32, 1)`. Filter row: `max-h: 0 → 48px`, 180ms. All in scoped `<style>` tag (ProspectorRowStyles). Hardware-accelerated (opacity + transform only).

**Headers:** `text-xs text-muted-foreground/60` → `text-sm font-semibold text-foreground`. Sortable headers are `<button>` with `active:scale-95` tactile feedback. `ChevronsUpDown` chevron on inactive columns (opacity-0 → 40 on hover).

**Row dividers:** `<tbody className="divide-y divide-border">` (desktop) + `<ul className="divide-y divide-border">` (mobile).

**Mobile:** No per-column filter. Single `<input type="search">` writes to `filters.title`. Dismiss button `alwaysVisible` (no hover on touch).

**QA arbitrary-value grep protocol (hard lesson enforced this cycle):**
```bash
grep -rnE 'className=.*\[[^]]+\]' <changed files>
```
Valid exceptions: `bg-background/95` (opacity modifier), `w-1/3` (fraction), `style={{ '--row-delay': ... }}` (CSS custom property via inline style, not className). Result this cycle: ZERO hits.

**pnpm validate:** PASS (17 test files, 63 tests, zero type errors, zero lint warnings).
**active:scale-95 confirmed:** lines 566, 737, 987 in updated component. No `scale-[0.98]`. No new npm dependencies.
