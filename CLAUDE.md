# BKT AI-Apply — Agent Entry Point

> **Read this file first. Always. Before writing any code.**

## Project Summary
Automated job application pipeline — React/Vite/TS + Supabase. Tracks the full lifecycle from
discovery through hire. Gmail/Calendar scrapers drive autonomous stage transitions via Supabase
Edge Functions. Multi-model AI routing assigns the best model per task type.

---

## Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript (strict) |
| Styling | Tailwind CSS v4 — no arbitrary values without ADR |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions) |
| Dev Env | GitHub Codespaces (primary) · Local VS Code (secondary) |
| Automation | Gmail API + Google Calendar API → Edge Function webhooks |
| AI | Multi-model routing — see `docs/conventions/model-routing.md` |

---

## Application Pipeline
```
Discovery → Applied → Screening → Interview Scheduled → Interview Complete → Offer → Hired
                                                                                   ↘ Rejected
                                                                                   ↘ Ghosted
```
**Every stage transition MUST write an `application_events` row. No exceptions.**

---

## Non-Negotiables
> Never violate without creating an ADR first.

1. **RLS always on** — Never disable Row Level Security on any Supabase table
2. **Single DB client** — All DB access via `src/lib/supabase.ts` only
3. **Auth boundary** — Auth state lives in `src/contexts/AuthContext.tsx` only
4. **Event sourcing** — Every `applications.stage` change writes to `application_events`
5. **User scoping** — Every query filters by `user_id`; no cross-user data leakage
6. **Types generated** — Run `pnpm db:gen-types` after schema changes; never handwrite DB types
7. **Validate before done** — `pnpm validate` must pass clean before any task is complete

---

## Key Reference Files
| Topic | Path |
|-------|------|
| Architecture + data flow | `docs/architecture.md` |
| Database schema | `docs/domain/data-model.md` |
| Business rules | `docs/domain/business-rules.md` |
| Pipeline stages | `docs/domain/pipeline-stages.md` |
| Auth + RLS | `docs/domain/auth.md` |
| AI model routing | `docs/conventions/model-routing.md` |
| Component patterns | `docs/conventions/component-patterns.md` |
| Golden principles | `docs/conventions/golden-principles.md` |
| Error handling | `docs/conventions/error-handling.md` |

---

## Source Directory Contract
```
src/
  components/        # Presentational only — zero data fetching
  features/
    jobs/            # Discovery, search, match scoring
    applications/    # Pipeline tracking, stage management
    gmail/           # Email ingestion, classification
    auto-apply/      # Browser automation, form submission
    ai-agent/        # Chat UI, model routing, RAG
    documents/       # Resume/cover letter gen + storage
  lib/
    supabase.ts      # Single Supabase client instance
    ai-router.ts     # Model routing logic
    gmail.ts         # Gmail API wrapper
  hooks/             # Shared hooks only
  pages/             # Route entry points — thin, delegate to features/
  types/             # Global types + generated Supabase types (db.types.ts)
  contexts/          # React contexts (AuthContext, etc.)
```

---

## Validation Sequence
```bash
pnpm typecheck    # zero type errors required
pnpm lint         # zero warnings (--max-warnings 0)
pnpm test         # all tests green
pnpm test:e2e     # required if UI changed
# or all at once:
pnpm validate
```

---

## After Every Task
- [ ] `pnpm validate` passes clean
- [ ] New business logic → update `docs/domain/business-rules.md`
- [ ] Architectural decision → create `docs/adr/NNN-description.md`
- [ ] New pattern → update `docs/conventions/component-patterns.md`
- [ ] Schema changed → run `pnpm db:gen-types`, commit `src/types/db.types.ts`
- [ ] New CLI tool → document in `.claude/commands/`

---

## When Uncertain
1. Check `docs/domain/` → `docs/conventions/` → `docs/adr/`
2. If no answer exists — ask before assuming
