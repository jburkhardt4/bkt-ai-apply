# Capture Protocol

> How knowledge enters the base. The loop is **forward and back**: agents read
> before planning, and emit drafts when they learn something. Only Context-Keeper
> confirms.

## Flow

```text
1. Pre-flight READ   any agent reads lessons + ADRs/BRs + relevant PATs; reports lessons_consulted
2. WORK              on HOLD/BLOCK/escalation → lesson_candidate; on shipping a reusable
                     pattern → pattern_candidate (both in the return packet)
3. COLLECT           Orchestrator gathers candidates into the work ledger
4. CONFIRM           at session close / escalation-resolution, Context-Keeper appends
                     confirmed LSN-NNN + PAT-NNN, and promotes recurring ones (≥2×) to BR/ADR
5. REBUILD           Context-Keeper runs `pnpm kb:build` (refresh bundle) then `pnpm kb:check` (gate)
```

## Rules

- **Append-only.** Never delete, reorder, or rewrite a confirmed entry. Supersede with a new ID.
- **Cite IDs, not literals.** Reference `BR-005`, not "the user-scoping rule".
- **Portability is mandatory on patterns** and decided at confirmation time (see `SCHEMA.md`).
- **One-way hub → spoke.** `pnpm kb:sync` pushes only `portable` entries into a spoke's
  `.knowledge-vendor/`. Spoke-local discoveries are namespaced (`PAT-ADV-*`, `LSN-EST-*`)
  and reach the hub **only** through Context-Keeper promotion — never by editing a vendored file.
- **Drift fails the build.** A hand-edited vendored skill/agent fails `kit:check`; a missing
  `portability`, duplicate ID, or dead reference path fails `kb:check`.

## Cadence

- `kb:build` + `kb:check`: every time a memory layer changes (Context-Keeper, post-confirm).
- `kit:check` + `kb:check`: in CI on every PR (hub) and as a spoke PR-checklist item.
- Bundle re-upload to the Claude Web Project / Designer: named PR-checklist step when the bundle's hub SHA changes.
