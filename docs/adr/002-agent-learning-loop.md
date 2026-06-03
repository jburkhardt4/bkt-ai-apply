# ADR-002 — Agent institutional-memory learning loop

- status: accepted
- date: 2026-06-03T00:00:00Z
- deciders: JB
- supersedes: —
- related: `docs/conventions/agent-protocol.md`, `docs/retro/lessons.md`, BR-008, LSN-001

## Context

Knowledge in the agent roster flowed forward and only on success. Context-Keeper
recorded "confirmed outcomes — never speculate," escalations dead-ended at JB,
and nothing captured *why* a gate failed. The same mistakes recurred (the
threshold conflict; the missing validation scripts) and agents could not learn
from each other.

## Decision

Adopt a closed learning loop over three append-only memory layers:

| Layer | File | Owner |
| --- | --- | --- |
| Decisions | `docs/adr/NNN-*.md` | Context-Keeper |
| Invariants | `docs/domain/business-rules.md` | Context-Keeper (BA/Security propose) |
| Lessons | `docs/retro/lessons.md` | Context-Keeper |

Mechanics (full spec in `docs/conventions/agent-protocol.md`):

1. **Pre-Flight Reads (Block A)** — implementing/validating agents read lessons +
   relevant ADRs/rules first and report `lessons_consulted`.
2. **Lesson Capture (Block B)** — any HOLD/BLOCK/escalation (or successful retry)
   emits a structured `lesson_candidate`.
3. **Capture** — Orchestrator collects candidates into the work ledger.
4. **Confirm** — at session close or escalation resolution, Context-Keeper
   appends confirmed lessons and promotes recurring ones to BR/ADR.

Two fields — `lessons_consulted` and `lesson_candidates` — are added to every
handoff packet. **Release-Gate will not PASS a task that involved a retry whose
`lesson_candidate` was not captured.**

## Consequences

- A resolved failure is now a recordable, confirmed outcome (clarifies Context-Keeper).
- Additive only — docs plus agent frontmatter/instructions; nothing ships in the bundle.
- Release-Gate gains one new gate (uncaptured retry → not PASS).
- Reversible via `git revert`; agents fall back to prior behavior.
