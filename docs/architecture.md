# Architecture — BKT AI-Apply

**status:** LIVING DOCUMENT  
**last_updated:** 2026-06-07  
**owner:** Ai-Integrations + Context-Keeper (joint maintenance)

---

## 1. Overview

BKT AI-Apply is an automated job application pipeline. It tracks the full lifecycle from job
discovery through hire. The system is built on React/Vite/TypeScript (frontend) and Supabase
(backend — PostgreSQL, Auth, Realtime, Storage, Edge Functions). External integrations drive
autonomous stage transitions and job discovery.

```text
Discovery → Applied → Screening → Interview Scheduled → Interview Complete → Offer → Hired
                                                                                   ↘ Rejected
                                                                                   ↘ Ghosted
```

Every stage transition writes an immutable `application_events` row (BR-002, BR-003).

---

## 2. Layer Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite + TypeScript strict)                      │
│  Tailwind CSS v4 · lucide-react · Supabase JS client (anon key)    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼─────────────────────────────────────┐
│  Supabase Platform                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ PostgreSQL  │  │ Auth (GoTrue)│  │ Realtime │  │  Storage    │ │
│  │  + RLS      │  │              │  │          │  │  (docs)     │ │
│  └──────┬──────┘  └──────────────┘  └──────────┘  └─────────────┘ │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐   │
│  │  Edge Functions (Deno runtime)                               │   │
│  │  prospector-cron · gmail-webhook · calendar-webhook          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ service-role client (Edge Functions only)
┌───────────────────────────────▼─────────────────────────────────────┐
│  External Integrations                                               │
│  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ SerpApi / Google Jobs│  │  Gmail API      │  │ Google        │  │
│  │ (job discovery)      │  │  (email ingest) │  │ Calendar API  │  │
│  └──────────────────────┘  └─────────────────┘  └───────────────┘  │
│  ┌──────────────────────┐  ┌─────────────────┐                      │
│  │ AI Providers         │  │ ATS APIs         │                      │
│  │ (Anthropic, OpenAI,  │  │ (Greenhouse,    │                      │
│  │  Google Gemini)      │  │  Ashby, Workday)│                      │
│  └──────────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Source Files

| Concern | Path |
|---|---|
| Single DB client | `src/lib/supabase.ts` |
| AI model router | `src/lib/ai-router.ts` |
| Gmail API wrapper | `src/lib/gmail.ts` |
| Auth context | `src/contexts/AuthContext.tsx` |
| Generated DB types | `src/types/db.types.ts` |
| Pipeline stage enum | `src/types/pipeline.ts` |
| Prospector cron | `supabase/functions/prospector-cron/index.ts` |

---

## 4. Data Flow — Job Discovery (Prospector)

```text
Supabase Cron (0 8,18 * * * UTC)
  └─► prospector-cron Edge Function
        ├─ reads prospecting_profiles WHERE is_active = true
        ├─ for each profile:
        │    ├─ builds SerpApi query from profile fields
        │    ├─ GET https://serpapi.com/search.json?engine=google_jobs&...
        │    ├─ parses jobs_results[]
        │    ├─ upserts into jobs (ON CONFLICT source_url DO NOTHING)  ← BR-063, BR-102
        │    ├─ updates prospecting_profiles.last_run_at / next_run_at
        │    └─ inserts prospecting_runs row (status: success|empty|partial|error)
        └─ errors per profile are isolated; one failure does not abort the run
```

---

## 5. Data Flow — Email → Stage Transition

```text
Gmail push notification
  └─► gmail-webhook Edge Function
        ├─ reads email body / subject
        ├─ classifies with Gemini 2.5 Flash (email_classification task)
        ├─ confidence >= 0.70: auto-transitions applications.stage via transition_stage RPC
        │    └─ RPC writes application_events row atomically (BR-002, LSN-004)
        └─ confidence < 0.70: stores in emails table, notifies JB (BR-030)
```

---

## 6. External Integrations

### 6.1 SerpApi — Google Jobs Engine

**Purpose:** Job discovery engine for the Automated Job Prospector (F-017). Replaces any custom
scraping logic. SerpApi provides a structured JSON interface to Google Jobs search results,
eliminating the need for HTML parsing, rate-limit negotiation, or bot-detection handling.

**Base Endpoint:**
```
https://serpapi.com/search.json?engine=google_jobs
```

**Authentication:** API key passed as `api_key` query parameter. Key stored in Supabase
encrypted secrets and accessed only via `Deno.env.get('SERPAPI_KEY')` inside Edge Functions.
Never passed to the client bundle (BR-006, INT-RULE-006).

**Query Parameter Mapping from `prospecting_profiles` Schema:**

The `prospecting_profiles` table uses array columns. The Edge Function constructs a single
SerpApi call per profile by merging array values.

| `prospecting_profiles` column | SerpApi parameter | Mapping logic |
|---|---|---|
| `job_titles text[]` | `q` (required, string) | First element used as the primary query term. If multiple titles exist, the Edge Function makes one SerpApi call per title to maximize coverage. |
| `locations text[]` | `location` (optional, string) | First non-empty element used. SerpApi `location` accepts a city, state, or country string. |
| `environments text[]` | appended to `q` | If `environments` contains `'remote'`, the string `"remote"` is appended to `q`. If `'hybrid'`, `"hybrid"` is appended. Multiple values each append a term. |
| `keywords text[]` | *(not sent to SerpApi)* | Keywords are stored for downstream RAG scoring but are **not** appended to `q` — doing so makes queries too specific and produces zero results for niche roles. |
| `job_types text[]` | `chips` (optional) | Mapped to SerpApi `chips` employment-type token. **Must use the uppercase enum token** `employment_type:FULLTIME`, NOT `job_type:fulltime` — the latter makes Google return a soft "no results" (HTTP 200 + `error` field, zero `jobs_results`), silently zeroing every run. Verified tokens: `'full-time'` → `employment_type:FULLTIME`, `'part-time'` → `employment_type:PARTTIME`, `'contract'` → `employment_type:CONTRACTOR`, `'internship'`/`'intern'` → `employment_type:INTERN`. Multiple values are comma-separated in `chips`. |

**Standard (fixed) parameters applied to every request:**

| Parameter | Value | Purpose |
|---|---|---|
| `engine` | `google_jobs` | Select the Google Jobs engine |
| `api_key` | `Deno.env.get('SERPAPI_KEY')` | Authentication |
| `num` | `10` (default) | Results per page |
| `hl` | `en` | Language: English |
| `gl` | `us` | Country: United States |

**Date filtering:**

`date_posted` chip filtering is **not applied**. It was found to zero out results for niche
role/location combinations (e.g. Salesforce roles in California). Duplicate ingestion is
handled at the DB layer via `ON CONFLICT (source_url) DO NOTHING`, making a date filter
redundant. `chips` is only set when `job_types` is non-empty.

**Example constructed query (single profile with one title):**

```
profile: {
  job_titles: ['Senior Product Manager'],
  locations: ['San Francisco, CA'],
  environments: ['remote'],
  keywords: ['SaaS', 'B2B'],
  job_types: ['full-time']
}

SerpApi URL:
https://serpapi.com/search.json
  ?engine=google_jobs
  &q=Senior+Product+Manager+remote
  &location=San+Francisco%2C+CA
  &chips=employment_type%3AFULLTIME
  &num=10
  &hl=en
  &gl=us
  &google_domain=google.com
  &api_key=<SERPAPI_KEY>
```

**Response shape (relevant fields from `jobs_results` array):**

```typescript
interface SerpApiJobResult {
  title: string;               // → jobs.title
  company_name: string;        // → companies.name (upsert or lookup)
  location: string;            // → jobs.location
  description: string;         // → jobs.description
  job_highlights?: {
    title: string;
    items: string[];
  }[];
  detected_extensions?: {
    posted_at?: string;        // → jobs.posted_at (parse to timestamptz)
    schedule_type?: string;    // → jobs.remote_type inference
    salary_min?: number;       // → jobs.compensation_min
    salary_max?: number;       // → jobs.compensation_max
  };
  related_links?: {
    link: string;              // first element used as jobs.source_url
    text: string;
  }[];
  job_id: string;              // used as fallback for source_url construction
  link: string;                // → jobs.source_url (primary candidate)
}
```

**Deduplication:** `jobs.source_url` carries a UNIQUE constraint (CHK-001). The Edge Function
upserts with `ON CONFLICT (source_url) DO NOTHING`. This satisfies BR-063 and BR-102.
SerpApi `job_id` is used to construct a stable fallback URL when `link` is absent:
`https://www.google.com/search?q=apply+{job_id}` — but the `link` field is always preferred.

**Rate limits and error handling:** SerpApi enforces per-plan rate limits. The Edge Function
uses exponential backoff on HTTP 429 responses (INT-RULE-003). A single failed SerpApi call
for one profile does not abort processing of other profiles (per-profile error isolation).
Errors are logged in `prospecting_runs.error` with `status = 'error'` or `'partial'`.

**Compliance:** SerpApi is a legitimate aggregator API. It does not require CAPTCHA bypass
(BR-032) and does not circumvent rate limits (BR-033). It does not scrape behind authentication
walls (INT-RULE-001, BR-034). API key registration email: john@bktadvisory.com (BR-043).

---

### 6.2 Gmail API

**Purpose:** Email ingestion for automated pipeline stage transitions.  
**Scope:** `gmail.readonly` — read-only; no send without explicit JB action.  
**Integration rule:** INT-001. Full spec in `docs/requirements/04-integrations.md`.

---

### 6.3 Google Calendar API

**Purpose:** Interview scheduling detection.  
**Scope:** `calendar.readonly`.  
**Integration rule:** INT-002. Full spec in `docs/requirements/04-integrations.md`.

---

### 6.4 AI Providers

Multi-model routing. All calls route through `src/lib/ai-router.ts`. Model assignments and
cost cap rules are documented in `docs/conventions/model-routing.md`.

| Provider | Models Used | Primary Task Types |
|---|---|---|
| Anthropic | Claude Opus 4.6, Claude Sonnet 4.6 | match_scoring, cover_letter_generation, interview_prep, general_qa |
| OpenAI | GPT-5 | resume_rewriting |
| Google | Gemini 2.5 Pro, Gemini 2.5 Flash | company_market_research, email_classification, intent_routing |

Cost hard cap: $75.00/month across all providers (BR-050).

---

### 6.5 ATS APIs

| Integration | ID | Status |
|---|---|---|
| Greenhouse | INT-004 | MVP |
| Ashby | INT-005 | MVP |
| Workday | INT-007 | MVP |

All ATS API keys stored in Supabase encrypted secrets (INT-RULE-006).

---

## 7. Security Model

- **RLS always on** — every table has Row Level Security enabled (BR-001)
- **User scoping** — every query filters by `user_id = auth.uid()` (BR-005)
- **Single client** — all DB access via `src/lib/supabase.ts` (BR-004)
- **Service role isolation** — `SUPABASE_SERVICE_ROLE_KEY` used only in Edge Functions, never in `src/` (BR-006)
- **Auth boundary** — auth state in `src/contexts/AuthContext.tsx` only (BR-008)
- **Event sourcing** — every `applications.stage` change writes `application_events` (BR-002)
- **Webhook HMAC** — all inbound webhooks must carry HMAC signature, verified before processing (BR-061)

---

## 8. Cron Schedule

| Function | Schedule (UTC) | Trigger |
|---|---|---|
| `prospector-cron` | `0 8,18 * * *` | Supabase Edge Function Schedule (Dashboard) |

The schedule is registered via the Supabase Dashboard (Edge Functions → Schedules) or via
`supabase.toml` cron field. The function reads `is_active` at runtime and skips inactive
profiles (BR-107). BR-100 enforces a maximum of two runs per 24-hour period per active profile.

---

## 9. Cross-References

| Topic | Reference |
|---|---|
| Database schema | `docs/requirements/03-data-entities.md` |
| Business rules | `docs/domain/business-rules.md` |
| Pipeline stages | `docs/domain/business-rules.md` BR-010–BR-013 |
| Auth + RLS | `docs/domain/auth.md` |
| AI model routing | `docs/conventions/model-routing.md` |
| Prospector schema | `docs/features/prospector-schema-proposal.md` |
| Integration rules | `docs/requirements/04-integrations.md` |
| Security rules | `docs/requirements/06-security-compliance.md` |
