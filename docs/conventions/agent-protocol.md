# Agent Protocol — Pre-Flight Reads, Lesson Capture & Packet Fields

> Canonical definition of the shared agent conventions for BKT AI-Apply.
> Individual `.github/agents/*.agent.md` files embed the relevant blocks; this
> file is the single source if they ever drift. Owned by **Context-Keeper**.

## The learning loop

```text
Pre-flight READ  ──►  agent reads lessons + relevant ADRs/rules before
                      producing its plan; reports lessons_consulted
        │
        ▼
Work  ──►  on any HOLD/BLOCK/escalation, the failing agent emits a
           structured lesson_candidate in its packet
        │
        ▼
Capture ──►  Orchestrator collects lesson_candidates into the work ledger
        │
        ▼
Confirm ──►  on session close OR escalation-resolution, Context-Keeper
             appends confirmed lessons + promotes recurring ones to BR/ADR
```

## The four knowledge layers

| Layer | Home | ID | Holds |
| --- | --- | --- | --- |
| Decisions | `docs/adr/NNN-*.md` | `ADR-NNN` | Architectural choices |
| Invariants | `docs/domain/business-rules.md` | `BR-NNN` | Confirmed rules |
| Lessons | `docs/retro/lessons.md` | `LSN-NNN` | Failures + prevention |
| **Patterns** | `knowledge/patterns/PAT-*.md` | `PAT-NNN` | Production-validated, reusable code/UX patterns |

All four are append-only and owned by **Context-Keeper**. Agents cite IDs, never
literals. Every entry carries a `portability` tag (`portable` | `hub-only` |
repo-scoped) — see `knowledge/SCHEMA.md`. The unified entry point is
`knowledge/INDEX.md`; only `portable` entries are vendored to spoke repos.

## Block A — Pre-Flight Reads (mandatory, before any plan or edit)

1. CLAUDE.md non-negotiables.
2. Relevant `docs/domain/` and `docs/conventions/` for this task.
3. Open ADRs in `docs/adr/`.
4. `docs/retro/lessons.md` — filter to tags relevant to this task.
5. `knowledge/patterns/` — reusable patterns relevant to this task (cite `PAT-NNN`).

Output a `lessons_consulted` list (lesson IDs) and state how each shaped the plan.
If a referenced file does not exist, HOLD and report the missing path — do not assume.

**Applies to:** Orchestrator, Business-Analyst, Ui-Ux, Feature-Dev,
Ai-Integrations, Supabase-Security, Qa-Uat, Critical-Path.

## Block B — Lesson Capture (on any HOLD / BLOCK / escalation)

Emit one `lesson_candidate` per distinct failure:

- id: `LSN-<draft>`
- trigger: what failed (gate, check, command)
- root_cause: why (1-2 sentences, no blame)
- prevention: the rule/check/step that would have caught it earlier
- tags: `[rls|auth|routing|stage-events|threshold|deploy|types|process|...]`

Never delete or rewrite an existing lesson. Drafts are confirmed only by Context-Keeper.

**Applies to:** any agent that can HOLD/BLOCK/escalate under these rules (including Orchestrator, Business-Analyst, Ui-Ux, Feature-Dev, Ai-Integrations, Supabase-Security, Qa-Uat, Critical-Path, Vercel, and Release-Gate).

## Packet fields (every completion / evidence / verdict packet)

Three fields are appended to every handoff packet:

- `lessons_consulted` — LSN ids read during Block A, with one line each on how it
  shaped the work. An agent that performs Block A must populate this or state
  `none-relevant`; agents with no Block A (Vercel, Release-Gate, Context-Keeper)
  may report an empty list.
- `lesson_candidates` — draft lessons emitted under Block B. Empty unless a
  HOLD/BLOCK/escalation occurred, or a retry succeeded (log what fixed it).
- `pattern_candidates` — draft reusable patterns an agent shipped and validated
  in production this session (a component contract, a motion utility, a query
  shape). Each: `id: PAT-<draft>`, `title`, `summary`, `portability`
  (`portable` | `hub-only` | repo-scoped), `example`/`files`, `tags`. Empty
  unless a reusable pattern was produced. Confirmed only by Context-Keeper.

## Confirmation & promotion (Context-Keeper)

- A RESOLVED failure is a confirmed outcome: record it. Successful retries:
  record what fixed them.
- Lessons are append-only. When a `root_cause`/tag recurs ≥ 2×, promote to a BR
  or ADR and link both ways.
- `pattern_candidates` are confirmed as `PAT-NNN` entries in `knowledge/patterns/`
  (append-only, each with a `portability` tag). After confirming any layer,
  Context-Keeper re-runs `pnpm kb:build` so the bundle stays in sync, and
  `pnpm kb:check` must pass.
- Triggers: session close, or escalation resolution by JB.
