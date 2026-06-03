# ADR-001 — Auto-apply match-score threshold = 80

- status: accepted
- date: 2026-06-03T00:00:00Z
- deciders: JB
- supersedes: —
- related: BR-008, LSN-001

## Context

The auto-apply submission gate — the score above which the system submits a job
application on JB's behalf with no human in the loop — was specified with three
different values across the repo:

| Value | Locations |
| --- | --- |
| 80 | `PROJECT_INSTRUCTIONS.md` (set by commit `4721e65`, 2026-06-03, "improved application accuracy") |
| 75 | `src/features/applications/data/masterProfile.ts`, `.github/agents/critical-path.agent.md`, `.github/prompts/wave3-dry-run.prompt.md` |
| 60 | `docs/prd.md` ("≥ 60% AI job-fit score threshold for submission") |

Both Critical-Path and Release-Gate gate on this number, so the drift is
dangerous: the same gate could pass in one agent and fail in another.

## Decision

The auto-apply threshold is **80** (`match_score ≥ 80` to auto-submit), recorded
as **BR-008** and referenced by ID everywhere. Rationale:

- 80 is JB's most recent explicit decision (commit `4721e65`, today).
- A higher bar is the safer default for an outward-facing automated action —
  a submitted application cannot be unsent.

All other locations are reconciled to 80; the literal must never be hardcoded
again — agents cite **BR-008**.

## Consequences

- Source change: `masterProfile.autoApplyThreshold` 75 → 80 (this value ships in the bundle).
- Doc/prompt changes: `critical-path.agent.md`, `wave3-dry-run.prompt.md`, `prd.md` reconciled to 80 / BR-008.
- Fewer auto-submissions than at 75/60; higher expected per-application fit.
- Future threshold changes happen in BR-008 plus a superseding ADR — never by editing literals.
