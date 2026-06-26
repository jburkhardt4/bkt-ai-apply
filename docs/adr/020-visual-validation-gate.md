# ADR-020 — Visual Validation Gate for UI Changes

- **Status:** Accepted
- **Date:** 2026-06-24
- **Relates:** Ui-Ux dual-skill binding (`.claude/agents/ui-ux.md`), `docs/conventions/agent-protocol.md` (handoff packet), `docs/conventions/component-patterns.md`, ported design skills (`design-taste-frontend`, `emil-design-eng`), non-negotiable "Validate before done"
- **Decided by:** JB, 2026-06-24

## Context

Agents generate front-end code, but nothing forces a human (or the agent itself) to look at the
**rendered** result before it merges. Across the BKT properties (`bkt-ai-apply`, `bktAdvisory`,
`bktadvisoryprojectestimator`) UI regressions can ship silently: a broken layout, an unsized
heading, a mobile overflow, or a motion choice that violates the design skills — none of which a
typecheck/lint/test pass catches.

The design skills (`design-taste-frontend`, `emil-design-eng`) raise *authoring* quality, but they
are advisory at generation time. We need a **gate** that produces a reviewable visual artifact and
records explicit approval before code is pushed.

## Decision

1. **Artifact-before-push.** Any change touching UI must produce a visual artifact prior to push —
   a Playwright screenshot, a Vercel preview deployment, or a Claude Designer/Artifact render.
2. **Playwright as the scriptable baseline.** Repos that perform visual work add `@playwright/test`
   (a justified dependency under each repo's "no new dependencies without justification" rule),
   a `playwright.config.ts`, and an `e2e/visual/` suite. Committed
   `e2e/visual/__screenshots__/*.png` are the baselines; transient `.tmp-*.png` are git-ignored.
3. **Handoff-packet fields.** Qa-Uat returns `preview_artifact`; Release-Gate requires
   `human_visual_approval` before a PASS on UI-affecting work (see `agent-protocol.md`).
4. **Anchor-aware review.** The `emil-design-eng` review gate MUST read the target repo's
   `docs/conventions/design-system.md` anchor-exception list, so it does not flag intentional brand
   choices (e.g. BKT's royal-blue accent, 3-column grids, Lucide/inline-SVG icons) as defects.
5. **Reduced-motion + responsive coverage.** Visual checks run at 375 / 768 / 1280 widths and under
   `prefers-reduced-motion` before approval.

## Consequences

- **New dependency** (`@playwright/test`) lands in `bktAdvisory` and `bktadvisoryprojectestimator`;
  this ADR is its justification.
- **Baselines must be maintained:** an intentional UI change requires refreshing the committed
  snapshot in the same PR, or the gate correctly fails.
- **Ordering dependency:** the gate depends on `design-system.md` (the exception list) existing
  first; enabling the Emil gate before it produces false REVISEs and erodes trust in the loop.
- The estimator has no `mcp-plugin.ts`; it uses Playwright-only artifacts. `bktAdvisory` also fixes
  `mcp-plugin.ts` so its `screenshot` tool returns the image, not just a URL.
