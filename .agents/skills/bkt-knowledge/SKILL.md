---
name: bkt-knowledge
description: BKT institutional knowledge base — the four memory layers (Decisions/Invariants/Lessons/Patterns), the portability contract, and the capture loop. Use in ANY BKT repo (hub or spoke) to consult prior decisions and patterns before planning, and to capture new ones afterward.
---

# bkt-knowledge

The portable interface to BKT's institutional memory. In the hub (`bkt-ai-apply`)
the source of truth is `knowledge/` + `docs/`. In a spoke (`bktAdvisory`,
`bktadvisoryprojectestimator`) you get a vendored, `portable`-only subset under
`.knowledge-vendor/`. **Knowledge flows one way: hub → spoke. Never hand-edit a
vendored copy** — it will fail `--check`; edit in the hub and re-sync.

## The four layers (cite IDs, never literals)

| Layer | Hub home | Spoke home | ID |
| --- | --- | --- | --- |
| Decisions | `docs/adr/` | (hub-only) | `ADR-NNN` |
| Invariants | `docs/domain/business-rules.md` | (hub-only) | `BR-NNN` |
| Lessons | `docs/retro/lessons.md` | `.knowledge-vendor/` (portable only) | `LSN-NNN` |
| Patterns | `knowledge/patterns/` | `.knowledge-vendor/patterns/` (portable only) | `PAT-NNN` |

## Before you plan (Pre-Flight)
1. Read relevant ADRs/BRs and `knowledge/patterns/` for this task.
2. Report `lessons_consulted` + any `PAT-NNN` you applied.
3. If a referenced path is missing, HOLD and report it — never assume.

## After you ship (Capture)
- On a HOLD/BLOCK/escalation → emit a `lesson_candidate`.
- On shipping a reusable pattern → emit a `pattern_candidate` with a `portability`
  tag (`portable` | `hub-only` | `repo-scoped`).
- Context-Keeper confirms drafts into `LSN-NNN` / `PAT-NNN`, then runs
  `pnpm kb:build` + `pnpm kb:check`.

## Portability
`portable` = applies to any BKT repo (vendored to spokes). `hub-only` = specific
to this app (never vendored). `repo-scoped` = one spoke; namespace the ID
(`PAT-ADV-*`, `LSN-EST-*`). Layers without frontmatter default to `hub-only`.

## Commands (hub)
- `pnpm kb:build` — regenerate `bkt-knowledge-bundle.md` (for Web/Designer/Desktop)
- `pnpm kb:check` — integrity gate (unique IDs, portability, reference paths, freshness)
- `pnpm kb:sync -- --target <path>` — vendor `portable` entries into a spoke

See `knowledge/INDEX.md`, `knowledge/SCHEMA.md`, `knowledge/capture-protocol.md`.
