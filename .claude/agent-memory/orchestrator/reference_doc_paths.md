---
name: reference-doc-paths
description: Where canonical specs actually live in bkt-ai-apply, and the ADR filename convention (numeric, not "ADR-NNN").
metadata:
  type: reference
---

Doc layout for /home/user/bkt-ai-apply:

- ADRs: `docs/adr/NNN-slug.md` (numeric prefix, e.g. `006-full-auto-submission.md`). A task that says "ADR-006" maps to `docs/adr/006-full-auto-submission.md`. There are two `001-*` files (auto-apply-threshold, gdpr-vs-event-immutability).
- Business rules: `docs/domain/business-rules.md` (append-only, BR-NNN ids).
- Auth/RLS: `docs/domain/auth.md`.
- Model routing: `docs/conventions/model-routing.md` (ROUTING matrix, cost policy, AI-RULE-NNN).
- Agent protocol / pre-flight: `docs/conventions/agent-protocol.md`.
- Component patterns: `docs/conventions/component-patterns.md`.
- Lessons: `docs/retro/lessons.md` (LSN-NNN, append-only, Context-Keeper-confirmed only).
- Architecture: `docs/architecture.md`.

Missing-but-referenced paths are tracked in [[project-missing-docs]].
