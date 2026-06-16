# BKT AI-Apply

AI-orchestrated job application automation and pipeline management platform.

Tracks the full lifecycle from job discovery through hire. Gmail and Google Calendar
intelligence drives autonomous stage transitions. Multi-model AI routing assigns the
best model per task type.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions) |
| Dev env | GitHub Codespaces (primary) · Local VS Code (secondary) |
| Automation | Gmail API + Google Calendar API → Edge Function webhooks |
| AI | Multi-model routing — Anthropic, OpenAI, Google |

## Pipeline

```
Discovery → Applied → Screening → Interview Scheduled → Interview Complete → Offer → Hired
                                                                                   ↘ Rejected
                                                                                   ↘ Ghosted
```

---

## Local setup

```bash
# 1. Copy env template and fill in values
cp .env.example .env

# 2. Install dependencies (pnpm required)
pnpm install

# 3. Start dev server
pnpm dev
```

`.env` requires at minimum:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Without Supabase configured, every screen falls back to seeded demo data.

---

## Validation

```bash
pnpm typecheck    # zero type errors
pnpm lint         # zero warnings
pnpm test         # all unit tests green
pnpm test:e2e     # Playwright e2e (run when UI changes)
pnpm validate     # all of the above in sequence
```

`pnpm validate` must pass clean before any task is considered done (BR-080).

---

## Key docs

| Topic | Path |
|---|---|
| Agent entry point (read first) | `CLAUDE.md` |
| Architecture + data flow | `docs/architecture.md` |
| Database schema | `docs/requirements/03-data-entities.md` |
| Business rules | `docs/domain/business-rules.md` |
| AI model routing | `docs/conventions/model-routing.md` |
| Auth + RLS | `docs/domain/auth.md` |
| ADRs | `docs/adr/` |
| Lessons register | `docs/retro/lessons.md` |

---

## Supabase Edge Function secrets

Set via `supabase secrets set NAME=value` (never in `.env` for Edge Functions):

| Secret | Purpose |
|---|---|
| `ANTHROPIC_KEY` | Claude models |
| `OPENAI_KEY` | GPT models |
| `GEMINI_KEY` | Gemini models |
| `SERPAPI_KEY` | Job discovery (prospector-cron) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail + Calendar OAuth |
| `GMAIL_REFRESH_TOKEN` | Gmail ingestion |
| `CRON_SECRET` | Locks the submission-worker endpoint |

See `.env.example` for the full list and descriptions.
