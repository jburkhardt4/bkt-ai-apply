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

## Block A — Pre-Flight Reads (mandatory, before any plan or edit)

1. CLAUDE.md non-negotiables.
2. Relevant `docs/domain/` and `docs/conventions/` for this task.
3. Open ADRs in `docs/adr/`.
4. `docs/retro/lessons.md` — filter to tags relevant to this task.

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

**Applies to:** Orchestrator, Qa-Uat, Supabase-Security, Critical-Path, Vercel, Release-Gate.

## Packet fields (every completion / evidence / verdict packet)

Two fields are appended to every handoff packet:

- `lessons_consulted` — LSN ids read during Block A, with one line each on how it
  shaped the work. An agent that performs Block A must populate this or state
  `none-relevant`; agents with no Block A (Vercel, Release-Gate, Context-Keeper)
  may report an empty list.
- `lesson_candidates` — draft lessons emitted under Block B. Empty unless a
  HOLD/BLOCK/escalation occurred, or a retry succeeded (log what fixed it).

## Confirmation & promotion (Context-Keeper)

- A RESOLVED failure is a confirmed outcome: record it. Successful retries:
  record what fixed them.
- Lessons are append-only. When a `root_cause`/tag recurs ≥ 2×, promote to a BR
  or ADR and link both ways.
- Triggers: session close, or escalation resolution by JB.
