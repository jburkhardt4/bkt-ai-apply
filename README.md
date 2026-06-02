# BKT AI-Apply

Automated job application pipeline — React/Vite/TS + Supabase.

**Pipeline:** `Discovery → Applied → Screening → Interview Scheduled → Interview Complete → Offer → Hired | Rejected | Ghosted`

## Stack

- React 18 + Vite + TypeScript (strict)
- Tailwind CSS v4
- Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- Multi-model AI routing (Claude / GPT / Gemini by task)
- Gmail + Google Calendar background scrapers

## Quick Start (GitHub Codespaces)

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Agent Orientation

See `CLAUDE.md` — read first before any code session.

## Docs

- `docs/architecture.md` — system topology
- `docs/domain/` — schema, business rules, pipeline stages, auth
- `docs/conventions/` — golden principles, component patterns, model routing
- `docs/adr/` — architecture decisions
