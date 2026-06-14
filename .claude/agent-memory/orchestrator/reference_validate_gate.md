---
name: reference-validate-gate
description: What `pnpm validate` runs in bkt-ai-apply and the recurring e2e/playwright pitfalls that have caused HOLDs.
metadata:
  type: reference
---

The "validate before done" gate is `pnpm validate` (CLAUDE.md non-negotiable #7, BR-080). Sub-sequence: `pnpm typecheck` (zero errors), `pnpm lint` (--max-warnings 0), `pnpm test` (vitest), and `pnpm test:e2e` (playwright) when UI changed. Schema changes require `pnpm db:gen-types` to refresh `src/types/db.types.ts` (BR-081/082) before validate.

Known pitfalls from confirmed lessons:
- LSN-002: `pnpm validate` script must actually exist/be wired — Qa-Uat HOLDs (never passes) when a required script is undefined.
- LSN-003: `@playwright/test` (the runner) is a SEPARATE package from `playwright`; both must be in devDependencies, and every new page/route needs at least one `e2e/*.spec.ts`. Vitest must exclude `e2e/**`.

**How to apply:** For any UI-touching tranche, require Qa-Uat to run the full `pnpm validate` incl. test:e2e, and require Feature-Dev/Ui-Ux to add e2e specs for new/changed screens. Verify exact script contents at dispatch time (they can drift) — see [[reference-doc-paths]].
