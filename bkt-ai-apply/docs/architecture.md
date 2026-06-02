# BKT AI-Apply — System Architecture

## Overview
Single-user automated job application platform. Supabase is the single source of truth.
All state changes are event-driven; the UI is a Realtime subscriber, never the source of truth.

---

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  React/Vite/TS                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Dashboard   │  │  AI Agent    │  │  Auto-Apply        │   │
│  │  (pipeline   │  │  (chat UI +  │  │  (trigger +        │   │
│  │   kanban)    │  │   model      │  │   status view)     │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘   │
│         └─────────────────┴────────────────────┘               │
│                           │ Supabase Realtime (WebSocket)       │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE PLATFORM                           │
│  PostgreSQL ◄──── Edge Functions ◄──── Signed Webhooks          │
│  Auth (JWT)        Storage (docs)       Realtime (pub/sub)       │
└────────────────────────────┬────────────────────────────────────┘
            ▲                │                  ▲
            │                ▼                  │
┌───────────┴──────┐  ┌──────────────┐  ┌──────┴────────────────┐
│ BACKGROUND       │  │ AI LAYER     │  │ BROWSER AGENT         │
│ SCRAPERS         │  │              │  │                       │
│                  │  │ Claude API   │  │ Stagehand (TS)        │
│ Gmail Watcher    │  │ OpenAI API   │  │ + Stealth Chromium    │
│ GCal Watcher     │  │ Gemini API   │  │                       │
│ (Cloud Run)      │  │ ai-router.ts │  │ Auto-apply flows      │
└──────────────────┘  └──────────────┘  └───────────────────────┘
```

---

## Data Flow: Email → Stage Transition

```
Gmail inbox
  → Gmail Watcher (polls Gmail API, Cloud Run or local daemon)
  → POST /functions/v1/classify-email (Gemini 2.5 Flash)
      classifies: interview_request | rejection | offer | screening | other
  → POST /functions/v1/process-email-event (HMAC-signed webhook)
      upserts email_events row
      matches to applications row (company fuzzy match)
      updates applications.stage
      inserts application_events row (trigger_type: 'auto_email')
  → Supabase Realtime broadcasts change
  → Dashboard updates — zero user action required
```

---

## Data Flow: Auto-Apply

```
Trigger (user or scheduled)
  → Gemini 2.5 Pro: job discovery + scrape listings
  → Claude Opus: match scoring (skills matrix + user prefs)
  → Score >= threshold (default 75) → proceed
  → GPT-5: tailor resume for this JD
  → Claude Opus: write cover letter
  → Stagehand browser agent: fill + submit portal form
  → Insert jobs row + applications row (stage: 'applied')
  → Insert application_events row (trigger_type: 'auto_apply')
```

---

## Architectural Decisions (ADR Index)
| Decision | Choice | File |
|----------|--------|------|
| Backend | Supabase (migrating from Google Sheets) | `docs/adr/001-supabase-migration.md` |
| AI routing | Multi-model by task type | `docs/adr/002-model-routing.md` |
| State management | Supabase Realtime (no Zustand/Redux) | `docs/adr/003-realtime-state.md` |
| Browser automation | Stagehand (TS-native) | `docs/adr/004-browser-automation.md` |

---

## Required Environment Variables
```bash
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Edge Functions ONLY — never in client bundle

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# Google OAuth (Gmail + Calendar scraper)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Security
EDGE_FUNCTION_WEBHOOK_SECRET=     # HMAC key for inbound webhook validation
```
