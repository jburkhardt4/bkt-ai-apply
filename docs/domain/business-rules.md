# Business Rules

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LIVING DOCUMENT — append only; never delete rules; supersede with new rule ID
**last_updated:** 2026-06-09

---

## Core Invariants (Never Violate)

| ID | Rule | Source |
| --- | --- | --- |
| BR-001 | RLS must be enabled on every Supabase table | SEC-001 |
| BR-002 | Every `applications.stage` change must write an `application_events` row | CLAUDE.md |
| BR-003 | `application_events` rows are never deleted or updated | SEC-007 |
| BR-004 | All DB access via `src/lib/supabase.ts` only | SEC-002 |
| BR-005 | Every query must filter by `user_id`; no cross-user data leakage | SEC-006 |
| BR-006 | `SUPABASE_SERVICE_ROLE_KEY` must never appear in the client bundle | SEC-004 |
| BR-007 | Documents are immutable after being linked to an application | US-007, AC-007-03 |
| BR-008 | Auth state lives in `src/contexts/AuthContext.tsx` only | SEC-003 |

---

## Pipeline Stage Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-010 | All ingested jobs default to `discovery` stage | AC-001-04 |
| BR-011 | Stage transitions are one-directional except: `ghosted` → `applied` is permitted | CLAUDE.md |
| BR-012 | Rejection email does NOT auto-overwrite an existing `offer` stage; manual confirm required | AC-005-03 |
| BR-013 | Valid pipeline stages: discovery, applied, screening, interview_scheduled, interview_complete, offer, hired, rejected, ghosted | pipeline.ts |

---

## AI Scoring Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-020 | match_score >= 60: job promoted to Consideration / manual review pipeline | SIGN-OFF-005 |
| BR-021 | match_score >= 80: system prepares Auto-Submit packet; JB approval gate triggered | SIGN-OFF-005 |
| BR-022 | match_score < 60: job stays in `discovery` with Reject recommendation; JB can override | SIGN-OFF-005 |
| BR-023 | Score override by JB requires a reason string; written to `application_events` with actor = 'jb_manual' | AC-003-06 |
| BR-024 | All AI scores store reasoning_trace in `ai_scores.reasoning_trace` | AI-RULE-009 |

---

## Email and Automation Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-030 | Email classification confidence < 0.70: email stored but NOT auto-actioned | AC-009-02 |
| BR-031 | Email classification confidence >= 0.70: auto-transition permitted with `application_events` row | AC-009-03 |
| BR-032 | No CAPTCHA bypass under any circumstances | INT-RULE-002 |
| BR-033 | No circumvention of rate limits; exponential backoff required | INT-RULE-003 |
| BR-034 | No scraping behind authentication walls without an approved API | INT-RULE-001 |

---

## Submission and Automation Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-040 | MVP submission requires JB explicit approval; no autonomous submission in MVP | SIGN-OFF-004 |
| BR-041 | Stagehand browser automation deferred to Post-MVP | SIGN-OFF-004 |
| BR-042 | System must query JB for approval before any external platform account creation or configuration | SIGN-OFF-003 |
| BR-043 | Preferred account email for all external registrations: [john@bktadvisory.com](mailto:john@bktadvisory.com) | SIGN-OFF-003 |

---

## AI Cost Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-050 | AI cost hard cap: $75.00/month across all providers | SIGN-OFF-001 |
| BR-051 | At 90% of cap ($67.50), JB notification is sent | AC-014-03 |
| BR-052 | At hard cap ($75.00), non-critical AI calls are blocked/queued | AC-014-04 |
| BR-053 | Critical pipeline calls (stage transitions, email classification) are never blocked by cost cap | AI-RULE-004 |
| BR-054 | All AI calls log tokens and estimated cost to `ai_model_usage` | AI-RULE-002 |

---

## Integration Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-060 | ZipRecruiter is not in the MVP integration set | SIGN-OFF-002 |
| BR-061 | All inbound webhooks must include HMAC signature; Edge Functions must verify before processing | WH-001, WH-002 |
| BR-062 | OAuth tokens stored server-side only; never exposed to client | AUTH-004 |
| BR-063 | Duplicate jobs by source_url are silently deduplicated; not inserted twice | AC-001-03 |

---

## Document and Material Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-070 | Documents are versioned per user per type (resume, cover_letter) | US-007 |
| BR-071 | A new version must be created rather than editing an existing document | BR-007 |
| BR-072 | Application-linked documents are marked is_locked = true and become immutable | E-008 |

---

## Validation Rule

| ID | Rule | Source |
| --- | --- | --- |
| BR-080 | `pnpm validate` (typecheck + lint + test) must pass before any task is considered done | CLAUDE.md |
| BR-081 | DB types (`src/types/db.types.ts`) must be regenerated via `pnpm db:gen-types` after every schema change | CLAUDE.md |
| BR-082 | Never handwrite DB types; always use generated types | CLAUDE.md |

---

## Pipeline Visibility and Audit Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-090 | `application_events` list endpoints and UI audit-log views MUST sort by `created_at DESC` (newest first); ascending sort is not a valid default for event timelines | D-003 |
| BR-091 | Pipeline board cards MUST surface the `last_event` summary: actor, event type, and timestamp of the most-recent `application_events` row for that application | D-002 |
| BR-092 | Pipeline board MUST maintain a Supabase Realtime subscription on `applications` and `application_events`; stage updates do NOT require a manual page refresh | D-001 |

---

## Prospector Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-100 | Prospector cron runs at most twice per 24-hour period per active profile; additional triggers within the same period are treated as no-ops | F-017, US-017 |
| BR-101 | A `prospecting_profiles` row may only exist where `user_id = auth.uid()`; RLS enforces this at the database layer — no exceptions and no service-role bypass in client code | BR-001, BR-005, SEC-001 |
| BR-102 | Prospector-ingested jobs are deduplicated by `source_url` before insert; a duplicate URL is silently skipped (no error raised, no duplicate row created) — this is the prospector-specific application of BR-063 | BR-063, AC-018-02 |
| BR-103 | All AI scoring initiated by a prospector run must route through `src/lib/ai-router.ts` using task type `match_scoring` (Claude Opus 4.6); usage must be logged to `ai_model_usage` per AI-RULE-002 and BR-054 | AI-RULE-001, AI-RULE-002, BR-054 |
| BR-104 | Prospector AI scoring runs count against the $75/month cap (BR-050); when the cap is reached, the prospector scoring run is queued — not cancelled — and resumes at the next billing period or on JB manual override | BR-050, BR-052, AC-018-06 |
| BR-105 | The "Ready to Apply" queue surfaces jobs with `match_score >= 60` (BR-020) whose `source` column on the `jobs` table equals `'prospector'`; jobs below this threshold remain in `discovery` stage | BR-020, BR-022, AC-018-07 |
| BR-106 | When a prospector run produces zero results, no error is raised; the run is logged to `prospecting_runs` with `jobs_found = 0`, `jobs_queued = 0`, and `status = 'empty'` | AC-018-03 |
| BR-107 | Setting `prospecting_profiles.is_active = false` halts all cron-triggered runs for that profile immediately; it does NOT prevent JB from manually triggering a single prospector run | AC-017-02, AC-017-03 |

---

## Conversational Assistant Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-110 | Every assistant turn is persisted: a `chat_messages` row (role `user`/`assistant`) inside a `chat_conversations` row, all scoped by `user_id` with RLS enforcing ownership | BR-001, BR-005, ADR-003 |
| BR-111 | Assistant replies are generated by the `ai-chat` Edge Function (Anthropic); `ANTHROPIC_API_KEY` lives only in the Edge runtime and is never shipped in the client bundle | INT-RULE-006, ADR-003 |
| BR-112 | Chat completions route through `src/lib/ai-router.ts` task type `general_qa` (Claude Sonnet 4.6); real token usage is logged to `ai_model_usage` (AI-RULE-002, BR-054) and gated by the $75/month cap — a capped turn persists a `deferred` assistant message instead of calling the model | AI-RULE-002, BR-050, BR-052, ADR-003 |
| BR-113 | Long-term memory (`chat_memory`) is user-scoped, injected into the assistant system prompt, and written when the model emits a `MEMORY:` directive (deduped, case-insensitive); users may delete memory items | AI-RULE-008, ADR-003 |
| BR-114 | Deleting a `chat_conversations` row cascades to its `chat_messages`; `chat_memory.source_conversation_id` is set NULL on conversation delete so memory survives chat deletion | ADR-003 |

---

## Model Provider & Integrations Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-120 | The AI Assistant supports user-selectable chat models across three providers (Anthropic / OpenAI / Google). The effective model is resolved from `CHAT_MODEL_CATALOG` in `src/lib/ai-router.ts`; an unknown name falls back to the `general_qa` default and is never forwarded to a provider | ADR-005, AI-RULE-001 |
| BR-121 | Selecting a non-default chat model is a JB manual override (AI-RULE-001), confirmed by the act of choosing it in the AI Assistant UI; the chosen provider + model are logged to `ai_model_usage` with cost priced by `getModelPricing` | ADR-005, AI-RULE-002, BR-054 |
| BR-122 | Provider API keys (`ANTHROPIC_KEY`, `OPENAI_KEY`, `GEMINI_KEY`) are project-level Supabase Edge Function secrets, read only via `Deno.env` in `_shared/llm/factory.ts`; they are never shipped in the client bundle. Supersedes the single-provider scope of BR-111 | ADR-005, INT-RULE-006, SEC-004 |
| BR-123 | The `provider-status` Edge Function returns booleans only (which providers are configured); it never returns key material and requires a valid Supabase JWT | ADR-005, SEC-004 |
| BR-124 | `ai-chat` is provider-agnostic via the `_shared/llm` factory; provider errors are normalized to `{ error, code, provider }` with a user-facing message that never leaks key material. The request defaults to `anthropic` when no provider is given (backward compatible) | ADR-005 |
| BR-125 | The model selector disables (greys out) any model whose provider key is not configured, per `provider-status`; configuration is global because keys are shared project secrets | ADR-005 |
