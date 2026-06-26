# Knowledge Schema

> Defines the shape of every knowledge entry and the **mandatory `portability`**
> contract. `pnpm kb:check` enforces what is mechanically checkable.

## `portability` (required on Patterns; default `hub-only` elsewhere)

| Value | Use when |
| --- | --- |
| `portable` | The entry applies to **any** BKT repo — generic UX/motion/component/process patterns, brand voice, design tokens. These are vendored to spokes. |
| `hub-only` | The entry is specific to `bkt-ai-apply` — Supabase pipeline, RLS posture, ATS/crawler, event sourcing. **Never** vendored. |
| `repo-scoped` | The entry belongs to a single spoke. Namespace its ID (`PAT-ADV-*`, `LSN-EST-*`) so it survives a future merge; it flows back to the hub only via Context-Keeper promotion. |

## Layers

### Decisions — `docs/adr/NNN-title.md`
- One file per decision. **Globally unique `NNN`** (kb:check fails on duplicates).
- H1 `# ADR-NNN — Title`; then `Status`, `Date` (ISO 8601), `Relates`, `Decided by`; sections `Context` / `Decision` / `Consequences`.
- Default `portability: hub-only` (architecture is app-specific unless stated).

### Invariants — `docs/domain/business-rules.md`
- Table rows `| BR-NNN | rule | source |`. **Unique `BR-NNN`.** Append-only; supersede with a new ID, never edit in place.

### Lessons — `docs/retro/lessons.md`
- `## LSN-NNN — title` blocks with `timestamp/trigger/root_cause/prevention/tags/status/promoted_to`. **Unique `LSN-NNN`.** Newest on top.

### Patterns — `knowledge/patterns/PAT-NNN-title.md`
Production-validated, reusable code/UX patterns. **YAML frontmatter is required:**

```yaml
---
id: PAT-001            # globally unique; spoke-local uses PAT-ADV-### / PAT-EST-###
title: Four-state component contract
portability: portable  # portable | hub-only | repo-scoped   (REQUIRED)
status: confirmed       # confirmed | draft
tags: [ui, react, state-coverage]
related: [BR-007, ADR-020]   # optional cross-links
---
```

Body: **Problem** → **Pattern** → **Example** (minimal, copy-pasteable) → **When not to use**.

## What `kb:check` enforces
1. Every `knowledge/patterns/*.md` has frontmatter with a valid `portability` value.
2. No duplicate `ADR-NNN` (filename prefix), `BR-NNN`, or `LSN-NNN`.
3. Every `CLAUDE.md` "Key Reference Files" path resolves.
4. `bkt-knowledge-bundle.md`, if present, is stamped with the current hub SHA (freshness; warning unless `--strict`).
