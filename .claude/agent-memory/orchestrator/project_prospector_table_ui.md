---
name: prospector-table-ui
description: ProspectorSearchResults was converted from a stacked list to a dual-subtree responsive table (desktop table + mobile list) on 2026-06-08. Key patterns and decisions recorded here.
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
