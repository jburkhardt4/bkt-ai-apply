# ADR-023 — Stage 5: Dark-Mode Toggle, Fluid Display Type & Container Queries

**Status:** Accepted
**Date:** 2026-06-27
**Extends / relates to:** ADR-018 (Mobile-Responsive Refactor), ADR-020 (Visual Validation Gate), ADR-022 (Mobile Design Hardening). Implements the "Still deferred (Stage 5)" follow-ups ADR-022 named.

## Context

ADR-022 closed Stages 0–4 of the mobile-design plan and explicitly parked four
items for Stage 5:

> dark-mode toggle + `@custom-variant dark`, partial display-step `clamp()`,
> container queries, and the `@theme --text-*` unification.

It also flagged credentialed / real-device verification as necessary-but-deferred
(headless Chromium can't render a physical notch, and authenticated-route coverage
needed a seeded user). This ADR lands the dark toggle, the fluid display type, the
container queries, and the verification harness. The `@theme --text-*` unification
is **not** in scope here (it's an internal Tailwind-mapping refactor, not one of the
four requested deliverables) and stays deferred.

Pre-existing state this ADR builds on:

- The bkt palette already ships a complete dark theme under `[data-theme="dark"]`
  (`src/styles/bkt.css`) — every semantic token (`--background`, `--surface`,
  `--text-*`, `--border`, `--sidebar-*`, …) has a dark value. It had **no toggle**
  and the app was light-only; `index.html` locked `color-scheme: light`.
- The display type steps (`--text-2xl`…`--text-5xl`) were static pixel values.
- The dashboard card grids (`AnalyticsReportsSection`, `AiCostMonitorCard`,
  `DashboardSummarySection`) reflowed on **viewport** breakpoints (`sm:`/`lg:`),
  even though they render inside the bounded dashboard column / a drawer — so their
  column count tracked the wrong width.

## Decision

### 1. Theme system — light / dark / system, persisted, FOUC-safe

A small, pure core in `src/lib/theme.ts` is the single source of truth for theme
resolution and DOM application, consumed by three callers in lockstep:

- **`ThemeProvider`** (`src/contexts/ThemeProvider.tsx`) owns `mode`
  (`light|dark|system`), tracks the OS preference via a listener-only effect (so
  `system` stays live), derives `resolved` in render, and writes it to the DOM in a
  DOM-only effect — **no synchronous setState in any effect body**
  (`react-hooks/set-state-in-effect`), mirroring `useIsMobile`/`useKeyboardInset`.
- **`useTheme`** (`src/contexts/theme-context.ts`) — context + hook split into a
  sibling non-component module (`react-refresh/only-export-components`), exactly like
  `auth-context.ts`.
- **The `index.html` FOUC guard** — a hand-inlined copy of the same resolution logic
  that runs *before the bundle* so the correct scheme paints on first frame (no
  flash). `src/lib/theme.ts` carries the canonical comment; the two must stay in sync
  (`STORAGE_KEY = 'bkt-theme'`, the `#ffffff`/`#0c0c0e` theme-colors, the resolve rule).

`applyResolvedTheme(resolved)` is the one authority for the DOM side-effects: the
`data-theme` attribute the tokens key on, the UA `color-scheme` (native scrollbars /
form controls / autofill match), and the `<meta name="theme-color">` status-bar tint.
`index.html`'s `color-scheme` meta becomes `light dark`.

**Default is `system`.** This is a deliberate, accessible, modern default and is made
transparent by the explicit *System* option in the toggle. It does change the initial
scheme for users whose OS is set to dark (the app is no longer unconditionally light).
It's a one-line change to default `getStoredMode()` to `'light'` if least-surprise is
preferred later.

`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` is added
to `src/index.css` so legacy Tailwind pages can use `dark:` utilities; token-driven
surfaces already flip through the CSS variables and need nothing.

### 2. `ThemeToggle` — one component, two placements

`src/components/ThemeToggle.tsx` is a segmented Light/System/Dark switch over the bkt
tokens (`role="radiogroup"`, per-option `aria-checked`, 44px touch floors via
`.bkt-touch`). Icon-only by default for dense chrome; `labels` for roomier surfaces.
Placed in:

- the **`AutoApplySidebar` footer** (icon-only) — covers the desktop sidebar **and** the
  mobile nav drawer (the sidebar renders in both), and
- the **Preferences → Quick Settings** tab (labelled), under a new "Appearance" section.

It reads `useTheme()` directly — theme is global UI state, not data, so this matches the
shell already consuming `useAuth()`.

### 3. Fluid display type (`clamp()`) — display steps only, desktop byte-inert

Only the **display** steps fluidize; the dense body/UI steps (`--text-2xs`…`--text-xl`)
stay static by design (a calm, upstream-sourced scale where exact px matter — the
constraint ADR-022 set). Each clamp's **MAX equals the prior fixed value and is reached
by a 768px viewport**, so desktop (≥768px) renders **byte-identically** to before; below
that the size eases to a mobile-appropriate MIN floor so big headings stop crowding a
440px phone. Formula: linear between (360px→MIN) and (768px→MAX), then clamped.

| token | before | after |
| ----- | ------ | ----- |
| `--text-2xl` | `1.625rem` | `clamp(1.375rem, 1.155rem + 0.98vw, 1.625rem)` |
| `--text-3xl` | `2rem` | `clamp(1.625rem, 1.293rem + 1.47vw, 2rem)` |
| `--text-4xl` | `2.5rem` | `clamp(2rem, 1.558rem + 1.96vw, 2.5rem)` |
| `--text-5xl` | `3.25rem` | `clamp(2.5rem, 1.838rem + 2.94vw, 3.25rem)` |

**Spacing was assessed and intentionally left static**: the `--space-*` 4px grid is used
pervasively and fluidizing it would regress the deliberate desktop density. A fluid page
gutter token is the right future move and is noted as a follow-up, not forced here — that
is what "where appropriate" means for this codebase.

### 4. Container queries for bounded card grids

The three card grids switch from viewport breakpoints to container queries (Tailwind v4
built-ins), so they reflow on their **actual** container width regardless of the
sidebar/drawer state:

- `AnalyticsReportsSection`: `CardContent` → `@container`; grid `sm:grid-cols-2` →
  `@md:grid-cols-2` (2 cols ≥28rem/448px).
- `AiCostMonitorCard`: `CardContent` → `@container`; breakdown `sm:grid-cols-3` →
  `@md:grid-cols-3`.
- `DashboardSummarySection`: `<section>` → `@container`; metrics
  `sm:grid-cols-3 lg:grid-cols-5` → `@md:grid-cols-3 @2xl:grid-cols-5`.

The extremes are preserved (mobile → fewest cols, wide desktop → most), but intermediate
container widths now resolve correctly instead of tracking the viewport.

### 5. Verification harness (credentialed / real-device)

- **`scripts/shot.ts`** now forces the scheme the *real* way — seed
  `localStorage['bkt-theme']` before navigation and let the FOUC guard paint it (replacing
  the old post-load `data-theme` injection), so dark captures exercise the shipped path and
  are deterministic across runner OS settings. It also performs an optional login when
  `SHOT_USER_EMAIL`/`SHOT_USER_PASSWORD` (or `TEST_USER_*`) are present, so protected routes
  (`pnpm shot /preferences`) capture the authenticated screen.
- **`e2e/a11y/mobile.a11y.mobile.spec.ts`** seeds the theme deterministically (light + dark)
  via the FOUC path and adds **creds-gated authenticated a11y coverage** (dashboard +
  preferences, both themes) that skips cleanly without `TEST_USER_*` — fulfilling the TODO
  the spec left in ADR-022.

**Real-device limits remain.** Headless Chromium can't render a physical notch (shot.ts
still *simulates* the 59/34 insets) and can't replace on-device Safari behaviour. A true
credentialed / real-device pass requires (a) `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` for the
authenticated specs+shots, and (b) a physical iPhone 17 Pro Max or a device farm
(e.g. BrowserStack) for genuine safe-area / keyboard / scroll behaviour. The harness is now
wired so supplying creds turns the authenticated coverage on with no further changes.

## Consequences

- The app is no longer light-only; `system` is the default, so OS-dark users now load dark.
  Documented and reversible (one line in `getStoredMode`).
- Desktop (≥768px) type is byte-inert (every clamp pins to its old MAX by 768px). The
  768px→below range is intentionally fluid — the point of the change.
- Container queries change intermediate-width column counts (by design); the mobile and
  wide-desktop extremes match the prior viewport behaviour.
- The FOUC guard in `index.html` MUST stay in sync with `src/lib/theme.ts` (storage key +
  theme colors + resolve rule). Drift would reintroduce a theme flash.
- No new dependencies. New files: `src/lib/theme.ts`, `src/contexts/theme-context.ts`,
  `src/contexts/ThemeProvider.tsx`, `src/components/ThemeToggle.tsx`.
- Verified: `pnpm validate` (typecheck + lint @ max-warnings 0 + 494 vitest) and `pnpm build`
  pass; the built CSS contains the `@container` rules, the clamp tokens, and the dark
  palette; `pnpm exec playwright test --project=mobile` is green (4 passed, 7 authenticated
  tests skip without creds); `pnpm shot /login` confirms the dark palette renders through the
  real FOUC path at 440×956.

## Still deferred (post-Stage 5)

- `@theme --text-*` unification (map the bkt type scale into the Tailwind `@theme` so
  Tailwind `text-*` utilities draw from it) — internal refactor, not requested here.
- A fluid page-gutter token (`clamp()`-based horizontal padding) adopted across screens.
- Adopting `dark:` utilities on the few legacy pages that hard-code light-only Tailwind
  colors (e.g. the `bg-green-50`/`bg-red-50` banner classes in `AiCostMonitorCard`), now
  that the variant exists.

## Verification

`pnpm validate` · `pnpm build` · `pnpm exec playwright test --project=mobile` ·
`pnpm shot /login` then inspect `.screens/*-dark.png`. With `TEST_USER_EMAIL` /
`TEST_USER_PASSWORD` set: the authenticated a11y tests run and `pnpm shot /preferences`
captures the real authenticated screen in light + dark.
