# BKT Knowledge Base — Index

> The single entry point to BKT's institutional memory. `bkt-ai-apply` is the
> **canonical hub**; client repos (`bktAdvisory`, `bktadvisoryprojectestimator`)
> receive a vendored, `portable`-only subset under `.knowledge-vendor/`.
> Knowledge flows **one way: hub → spoke.** Never hand-edit a vendored copy.

## The four layers

| Layer | Home | ID | Owner |
| --- | --- | --- | --- |
| **Decisions** | [`docs/adr/`](../docs/adr) | `ADR-NNN` | Context-Keeper |
| **Invariants** | [`docs/domain/business-rules.md`](../docs/domain/business-rules.md) | `BR-NNN` | Context-Keeper (BA/Security propose) |
| **Lessons** | [`docs/retro/lessons.md`](../docs/retro/lessons.md) | `LSN-NNN` | Context-Keeper |
| **Patterns** | [`patterns/`](./patterns) | `PAT-NNN` | Context-Keeper |

All four are **append-only**. Agents cite IDs, never literals.

## Portability

Every shareable entry carries a `portability` tag (see [`SCHEMA.md`](./SCHEMA.md)):

| Value | Meaning | Vendored to spokes? |
| --- | --- | --- |
| `portable` | Applies to any BKT repo (UX/motion/process patterns, brand) | ✅ via `pnpm kb:sync` |
| `hub-only` | Specific to this app (Supabase pipeline, ATS, RLS) | ❌ |
| `repo-scoped` | Belongs to one spoke; namespaced `PAT-ADV-*` / `LSN-EST-*` | only back to hub via Context-Keeper |

Layers without explicit frontmatter (ADR/BR/LSN) **default to `hub-only`** — safe
by default; mark an entry `portable` only when it genuinely applies everywhere.

## Tooling

| Command | Does |
| --- | --- |
| `pnpm kb:build` | Regenerate `bkt-knowledge-bundle.md` (SHA-stamped) for Web/Designer/Desktop |
| `pnpm kb:check` | Integrity gate — unique IDs, valid `portability`, resolvable reference paths, bundle freshness |
| `pnpm kb:sync -- --target <path>` | Vendor `portable` entries into a spoke's `.knowledge-vendor/` |

## See also

- [`SCHEMA.md`](./SCHEMA.md) — entry shapes + the `portability` contract
- [`capture-protocol.md`](./capture-protocol.md) — how candidates become confirmed entries
- [`../docs/conventions/agent-protocol.md`](../docs/conventions/agent-protocol.md) — Pre-Flight Reads + packet fields
