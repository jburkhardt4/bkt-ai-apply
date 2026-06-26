# ADR-018 — Mobile-Responsive Refactor (iPhone 17 Pro Max)

**Status:** Accepted
**Date:** 2026-06-26
**Supersedes / relates to:** ADR-016 (Dashboard consolidation), the AppShell + AutoApplySidebar redesign.

## Context

The app was desktop-only: `AppShell` rendered a fixed 224px sidebar unconditionally, core screens used rigid multi-column grids (JobsScreen ~800px table, DocBuilder's 360px + 332px fixed side panes, Inbox's 440px master panel, `1fr 1fr` form grids), and shared controls had sub-44px touch targets. A stale doc (`docs/features/prospector-ui-spec.md`) referenced an "AppShell mobile Sheet nav pattern" that was specced but never built.

We needed the whole app usable at 430px (iPhone 17 Pro Max) with **zero visual/structural change on desktop (≥768px)**, without modifying the design-system tokens or introducing a new CSS/UI framework.

## Decision

1. **Breakpoint.** Mobile = `(max-width: 767px)` (the `<md` threshold the docs already use). ≥768px renders the unchanged desktop layout.

2. **`useIsMobile()` hook** (`src/hooks/useIsMobile.ts`) is the single source of truth. The auto-apply screens (`src/features/auto-apply/screens/*`) and BKT primitives use inline `style={{}}` objects referencing CSS variables — media queries can't reach them — so layout adapts via **conditional JS rendering** keyed on this boolean. Every change is written as `isMobile ? <mobile> : <current-literal>`, so the desktop branch is the exact pre-existing code. The hook mirrors `useNavKey()` (lazy `useState` initializer + listener-only effect) to satisfy `react-hooks/set-state-in-effect`.

3. **Additive mobile stylesheet** (`src/styles/responsive.css`, imported once from `src/index.css`). It defines **no design tokens** — only a left-drawer keyframe and a `.bkt-touch` rule, both scoped inside `@media (max-width:767px)`. The immutable token files (`src/styles/bkt.css`, the `@theme` block in `src/index.css`) are untouched.

4. **Touch targets via CSS, not JS.** `BktButton`/`BktInput` always carry a `bkt-touch` class (BktButton also `data-bkt-icon` for icon size); `responsive.css` lifts them to ≥44px **only** under the mobile media query (`min-height: 44px !important`). This is zero-runtime, byte-neutral on desktop, and avoids re-rendering every control on resize.

5. **Mobile shell.** Under 768px `AppShell` hides the static sidebar and renders a sticky `MobileTopBar` (hamburger + brand + AI assistant + notifications) plus a **left slide-in nav drawer** that reuses the existing AI-assistant slide-over pattern; selecting a nav item closes the drawer before navigating.

6. **Per-screen transforms.** JobsScreen → stacked cards (JobRow gains `isMobile`); Preferences → single-column forms + horizontally-scrolling tabs; Inbox → list⇄detail toggle; DocBuilder → segmented `[Edit|Preview|AI]` tabs (DocAssistant gains `widthOverride`); DocPaper PreviewModal, QuickReview, JDSidebar → reflow/condense.

## Consequences

- **Desktop is provably unchanged**: a Playwright `desktop` project (default viewport, runs every spec except `*.mobile.spec.ts`) plus screenshot diffing guards regressions; a `mobile` project (430×932) runs `*.mobile.spec.ts`.
- New mobile layouts are opt-in per screen and easy to extend with the same `isMobile` pattern.
- **IngestionPage was intentionally left as-is.** Its pre-existing arbitrary Tailwind values (`min-w-[820px]`, `max-w-[180px]`, `max-w-[200px]`) are already mobile-safe (the table is wrapped in `overflow-x-auto`). Swapping them to the nearest token utilities (`min-w-3xl`=768px, `max-w-44`=176px) would shift desktop truncation by a few pixels — a desktop change we explicitly avoid. These remain documented exceptions to the "no arbitrary values" rule under this ADR; no **new** arbitrary values were introduced.

## Verification

`pnpm validate` (typecheck + lint @ max-warnings 0 + vitest) must pass; `pnpm test:e2e` runs both projects; manual emulation at 430×932; and the arbitrary-Tailwind grep over `src/pages src/components` must show nothing new.
