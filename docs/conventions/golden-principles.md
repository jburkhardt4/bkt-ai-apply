# Golden Principles

> The standing rules every agent and contributor operates under. These restate and consolidate the
> `CLAUDE.md` non-negotiables, the working style, and the gate policy so they are citable from one place.

## Non-negotiables (never violate without an ADR first)

1. **RLS always on** — never disable Row Level Security on any Supabase table.
2. **Single DB client** — all DB access via `src/lib/supabase.ts` only.
3. **Auth boundary** — auth state lives in `src/contexts/AuthContext.tsx` only.
4. **Event sourcing** — every `applications.stage` change writes to `application_events`.
5. **User scoping** — every query filters by `user_id`; no cross-user data leakage.
6. **Types generated** — run `pnpm db:gen-types` after schema changes; never handwrite DB types.
7. **Validate before done** — `pnpm validate` (typecheck + lint + test) must pass clean.

## Working style

- Plan before edits; prefer **minimal diffs** over large refactors.
- Preserve existing architecture unless a change is explicitly justified (by an ADR).
- Name affected files before editing them; state verification steps.
- Bound blast radius: when a change orphans code, track a follow-up sweep rather than expanding scope.
- No new dependencies without justification (record the justification, ideally in an ADR).

## Knowledge & gate policy

- Institutional memory is **append-only** across four layers — Decisions (`docs/adr/`), Invariants
  (`docs/domain/business-rules.md`), Lessons (`docs/retro/lessons.md`), and **Patterns**
  (`knowledge/patterns/`, the reusable-code layer). Agents cite IDs, never literals.
- **Pre-flight read** before planning; report `lessons_consulted`.
- On any HOLD/BLOCK/escalation, emit a structured `lesson_candidate`.
- Phase PASS is required before advancing; Orchestrator retries once, then escalates to JB.
- Release-Gate is the terminal decision node and will not PASS a retried task whose lesson was not captured.
- Context-Keeper confirms lessons / promotes recurring ones at session close.

## UI work

- Ui-Ux applies the **mandatory dual-skill binding** (`design-taste-frontend` + `emil-design-eng`)
  plus exactly one direction skill, and returns `skills_applied`.
- UI-affecting changes pass the **visual validation gate** (ADR-017) before push.

## When uncertain

Check `docs/domain/` → `docs/conventions/` → `docs/adr/`. If no answer exists, ask before assuming.
