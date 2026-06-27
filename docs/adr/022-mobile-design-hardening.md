# ADR-022 — Mobile Design Hardening: Safe-Area, Viewport Units & 440×956 Visual Loop

**Status:** Accepted
**Date:** 2026-06-27
**Extends / relates to:** ADR-018 (Mobile-Responsive Refactor), ADR-020 (Visual Validation Gate). Implements Stage 0–1 of the mobile-design plan derived from the "High-Fidelity Mobile-Responsive Web Development" blueprint.

## Context

ADR-018 made the app structurally usable at the mobile breakpoint (`useIsMobile()` /
`max-width:767px`, the `MobileTopBar` + drawer shell, per-screen reflows, the opt-in
`.bkt-touch` 44px floor). It did **not** address the iPhone 17 Pro Max device chrome:
the notch / Dynamic Island (top inset 59px) and home indicator (bottom inset 34px).

Audit findings (verified) that this ADR closes:

- `index.html` had no `viewport-fit=cover`, so **every** `env(safe-area-inset-*)` resolved
  to `0` — any safe-area CSS would have been a silent no-op.
- There was **zero** safe-area handling anywhere in `src/`. The sticky `MobileTopBar`
  (`top:0`, 56px) rendered under the Dynamic Island; the nav drawer, AI-assistant
  slide-over, the AI-Writer FAB and the toast stack sat under the home indicator.
- `AppShell.tsx` used bare `height:100vh` on the root frame (the one bare-`100vh` in
  `src`), causing the iOS address-bar jump and bottom clipping, even though `body`/`#root`
  already used `100svh`.
- Raw/bkt text inputs render at 13–14px, **below the 16px iOS auto-zoom threshold**, so
  focusing any field zoomed the whole viewport.
- Scroll containers had no `overscroll-behavior`; taps showed the default grey iOS flash.
- The Playwright `mobile` project ran at **430×932 DPR1** (mislabeled "iPhone 17 Pro Max")
  with no screenshot or a11y coverage, so device-accurate regressions were untestable.

The blueprint also prescribes several changes that would **fork working systems** in this
repo; those are explicitly adapted below rather than adopted verbatim.

## Decision

### 1. Safe areas are token-driven and applied once per fixed edge

`src/styles/bkt.css` defines `--safe-top/-bottom/-left/-right = env(safe-area-inset-*, 0px)`.
Components consume `var(--safe-*)` via `calc()` on the **single outermost fixed/sticky node
per edge** — never double-applied on nested children. The `, 0px` fallback makes every
consumer **desktop-inert** (and inert on non-notch devices). Applied to: `MobileTopBar`
(top), the AI-assistant slide-over (top + bottom), the AI-Writer FAB + its panel and the
toast stack (bottom). The shared `AutoApplySidebar` gained an opt-in `safeArea` prop set
**only** by the mobile drawer instance, so the desktop sidebar is untouched.

### 2. Viewport units: svh frame, dvh modals, env() chrome

`index.html` gets `viewport-fit=cover`. `AppShell`'s root frame moves `100vh → 100dvh`.
Growable modal/preview height caps move `vh → dvh` (SavedScreen, DocPaper, DocAssistant).
`body`/`#root` keep `100svh`. This deliberate three-unit split — **svh** for the fixed app
frame, **dvh** for content that should grow with the address bar, **env()** for device
chrome — is intentional; do not "normalize" it to one unit.

### 3. Mobile input zoom floor (scoped, not app-wide)

`responsive.css` (inside the existing `max-width:767px` layer) pins `input, textarea` to
`font-size:16px !important` — killing iOS focus auto-zoom on every raw/bkt input at once.
The `!important` mirrors the existing `.bkt-touch` precedent and is required to beat the
inline `font:` shorthand. Desktop density (14px) is untouched. `select` is excluded (the
shadcn trigger is a styled button, not a native field).

### 4. Theme + chrome meta

`index.html` declares `color-scheme: light` and `theme-color: #ffffff`. The app is
**light-only today** (the `[data-theme="dark"]` palette has no toggle yet), so locking the
UA color-scheme to light keeps native controls/scrollbars from rendering dark chrome on a
light surface. When a dark toggle ships (plan Stage 5), drive these dynamically.

### 5. 440×956 DPR3 visual loop + axe gate (extends ADR-020)

The Playwright `mobile` project is corrected to **440×956, `deviceScaleFactor:3`** (and the
`innerWidth===430` assertion + mislabeled comments fixed). A new `scripts/shot.ts`
(`pnpm shot <route> <label>`, runner `tsx`) captures the portrait/fold/dark/landscape matrix
into `.screens/` (git-ignored). A new `e2e/a11y/mobile.a11y.mobile.spec.ts` runs `axe-core`
(`@axe-core/playwright`) WCAG 2 A/AA at 440×956 in light and dark. Both Playwright config and
`shot.ts` auto-detect a pre-installed Chromium under `PLAYWRIGHT_BROWSERS_PATH` (Codespaces)
and fall back to the default browser (CI runs `playwright install`).

Two device-emulation truths are encoded in `shot.ts`/the a11y spec: (a) dark mode is toggled
by setting the **`data-theme` attribute after load** (this app ignores `prefers-color-scheme`,
and an init-script attribute does not survive hydration); (b) headless Chromium reports
`env(safe-area-inset-*)` as `0`, so `shot.ts` **simulates** the 59/34 (portrait) and
59/21 (landscape) insets via a `--safe-*` override for visualization only — real-device
verification remains required for true safe-area behaviour.

### 6. Blueprint adaptations (do NOT adopt verbatim)

- **Dark mode** — keep `[data-theme="dark"]`; do **not** introduce the blueprint's `.dark`
  class. A `@custom-variant dark` aligned to `[data-theme]` (so `dark:` utilities work
  without forking the palette) is deferred to Stage 2/5 with the toggle.
- **Motion lib** — do **not** add `motion/react` / `@use-gesture`; the CSS motion contract
  + the hand-rolled `QuickReview` swipe already cover the need. Shared swipe/reduced-motion
  hooks are the chosen path if reuse is needed.
- **Fluid `clamp()` type** — do **not** convert the static scale wholesale (it is a calm,
  dense, upstream-sourced port). Only display steps may be fluidized later, ADR-gated.
- **44px "by construction"** — apply the floor via the mobile media layer, not the base cva
  variants, to preserve intentionally dense desktop toolbars.

## Consequences

- `viewport-fit=cover` is the linchpin: it MUST stay paired with the inset padding. Removing
  it silently disables every safe-area fix while the code still "looks" correct.
- New devDeps: `tsx`, `@axe-core/playwright` — justified here (extends ADR-020's gate).
- Correcting the mobile viewport to 440 required updating the `innerWidth===430` assertion in
  the same change; both mobile specs and the new a11y spec pass at 440×956 (light + dark).
- Headless Chromium cannot render a physical notch; the screenshot/a11y gate is
  necessary-but-insufficient for safe-area — real-device or inset-injection QA still applies.
- Verified: `pnpm validate` (typecheck + lint @ max-warnings 0 + 494 vitest) and `pnpm build`
  pass; `pnpm exec playwright test --project=mobile` is green; desktop (≥768px) is byte-inert
  (all changes gated by `--safe-*` 0px fallbacks, the `max-width:767px` layer, or the mobile
  drawer branch).

## Verification

`pnpm validate` · `pnpm build` · `pnpm exec playwright test --project=mobile` ·
`pnpm shot <route>` then inspect `.screens/*.png` at 440×956 (portrait/dark/landscape).
