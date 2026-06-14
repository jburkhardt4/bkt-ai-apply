---
name: project-missing-docs
description: CLAUDE.md references four docs that do not exist on disk; use these authoritative fallbacks instead of HOLDing the cycle.
metadata:
  type: project
---

CLAUDE.md's "Key Reference Files" table points at four paths that are NOT present in the repo (verified 2026-06-13 on branch claude/focused-cannon-9jjm88):

- `docs/domain/pipeline-stages.md` — MISSING. Canonical stage list + order lives in `docs/domain/business-rules.md` BR-010–BR-013 and `docs/architecture.md` §1. Valid stages (BR-013): discovery, applied, screening, interview_scheduled, interview_complete, offer, hired, rejected, ghosted. "At/after applied" for submitted counts = every stage except discovery (and excluding rejected/ghosted depends on intent — confirm with caller).
- `docs/domain/data-model.md` — MISSING. Read schema directly from `supabase/migrations/` instead.
- `docs/conventions/golden-principles.md` — MISSING.
- `docs/conventions/error-handling.md` — MISSING.

**Why:** A strict pre-flight HOLD on every missing path would stall every cycle, but the load-bearing content (stage order, schema) is recoverable from other sources, so proceed and flag the gap as a follow-up.
**How to apply:** When a task references these paths, do NOT auto-HOLD. Use the fallbacks above, and add "create the missing canonical doc" as a recommended follow-up in the final report. Genuinely-absent load-bearing content (no fallback) still HOLDs. See [[reference-doc-paths]].
