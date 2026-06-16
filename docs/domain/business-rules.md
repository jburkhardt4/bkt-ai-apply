# Business Rules

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LIVING DOCUMENT — append only; never delete rules; supersede with new rule ID
**last_updated:** 2026-06-16

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
| BR-025 | Heuristic fallback calibration (`pipelineService.scoreJobFit`): expected-target match counts are skills 3, domain 1, seniority 2, tools 2; Location/Auth awards 10 for remote/hybrid/anywhere/US/target-metro and a 5 baseline otherwise. Calibrated 2026-06 to stop starving the funnel below the BR-020 line. The BR-021 auto-submit threshold (80) is unchanged | BR-020, BR-141 |

---

## Email and Automation Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-030 | Email classification confidence < 0.70: email stored but NOT auto-actioned | AC-009-02 |
| BR-031 | Email classification confidence >= 0.70: auto-transition permitted with `application_events` row | AC-009-03 |
| BR-032 | No CAPTCHA bypass under any circumstances | INT-RULE-002 |
| BR-033 | No circumvention of rate limits; exponential backoff required | INT-RULE-003 |
| BR-034 | No scraping behind authentication walls without an approved API | INT-RULE-001 |
| BR-035 | gmail-sync persists only job-relevant email: classification ≠ `unknown`, sender matched to a tracked application's company, **or the message carries a Gmail label mapped in `gmail_label_map`**; all other mail is never stored | gmail-sync Edge Function |
| BR-036 | Gmail ingestion is incremental via `gmail_sync_state.history_id` (cursor held back when a run truncates) and deduplicated by `emails UNIQUE (user_id, gmail_message_id)`; ingestion uses `gmail.readonly` (sending is separately scoped, BR-038) | gmail-sync Edge Function, docs/deploy/gmail-sync-setup.md |
| BR-037 | A Gmail label mapped in `gmail_label_map` is authoritative: it sets the classification at confidence 0.95 (`source = 'gmail_label'`), skips the Gemini call, and drives the inbox display chip. Gemini classifies only unlabeled mail; stage transitions still flow through the BR-030/031 machinery | gmail_label_map, gmail-sync Edge Function |
| BR-038 | Email sending (`gmail-send`, scope `gmail.send`) is an explicit user action only — JWT-verified, never autonomous, max 10 sends per rolling minute, every send audited as a `notifications` row (`email_sent`). AI drafts (`email_draft` task, Gemini Flash) are always returned for human review and never sent automatically | gmail-send Edge Function, ComposeModal |

---

## Submission and Automation Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-040 | ~~MVP submission requires JB explicit approval; no autonomous submission in MVP~~ — **superseded by ADR-006** (BR-130: approval requirement now depends on review mode) | SIGN-OFF-004, ADR-006 |
| BR-041 | ~~Stagehand browser automation deferred to Post-MVP~~ — **superseded by ADR-006** (BR-134: Browserbase + Stagehand is the browser submission channel) | SIGN-OFF-004, ADR-006 |
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
| BR-073 | Resume + cover-letter copy must never contain em-dashes (—) or en-dashes (–) — a known AI "tell". Enforced in three layers: the generation/assistant prompts forbid them, `textSanitizer.sanitizeDashes` strips any that slip through before they reach builder state, and seed copy + structural separators use commas/periods/middots | US-007 |
| BR-074 | The DocBuilder resume + cover-letter sections are fully editable: roles, education entries, bullet lines, and letter paragraphs can each be added and removed (not a fixed template) | US-007 |

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

---

## Auto-Submission Rules (ADR-006)

| ID | Rule | Source |
| --- | --- | --- |
| BR-130 | Submission autonomy follows `user_settings.review_mode`: `review` = explicit JB approval per application; `assist` = scores ≥ threshold auto-queue as approved; `auto` = scores ≥ threshold submit autonomously within guardrails | ADR-006 |
| BR-131 | All autonomy guardrails (score threshold, credits/budget, daily cap, pause) are enforced server-side in the submission worker from `user_settings`; client state is never trusted for submission decisions. **Authorization to submit is derived server-side from `user_settings.review_mode` plus the server-side `match_score`/threshold, OR from an explicit `approval` `application_events` row — never from the client-supplied `application_queue.queued_by` (audit-only).** A claimed row lacking both stays `approved` (`awaiting_approval`) and is never cancelled for lacking authorization | ADR-006 |
| BR-132 | `user_settings.paused = true` is an immediate kill switch: the worker submits nothing for that user while set | ADR-006 |
| BR-133 | Submission workflow state lives in `application_queue` (one row per application, `UNIQUE (application_id)`); every attempt and outcome also writes an `application_events` row — the event log remains the source of truth | ADR-006, BR-004 |
| BR-134 | Submission is API-first (`application_method` `api`/`ats` → ATS endpoint adapters); browser-channel postings submit via Browserbase + Stagehand. BR-032/033/034 remain binding — postings that cannot be submitted within those rules fail to manual with a recorded reason | ADR-006, BR-032, BR-033, BR-034 |
| BR-135 | An application transitions `discovery → applied` only on confirmed successful submission (or explicit JB manual action); queueing alone never changes stage | ADR-006, BR-004 |
| BR-136 | Each submission decrements `user_settings.credits` atomically; zero credits or exhausted monthly budget halts assist/auto queueing and submission until replenished | ADR-006 |
| BR-146 | The submission worker defaults to a zero-side-effect dry-run; real submissions fire only when `SUBMISSION_LIVE=true` AND the resolved channel's config is present. Absent config (no ATS board/payload, no Browserbase key) fails to manual with a recorded reason — the worker never blind-fires (BR-032/033/034 remain binding) | ADR-006, BR-134 |
| BR-147 | A submission credit is charged atomically at claim (`claim_submission`) and refunded on failure or stuck-expiry (`finalize_submission`/`expire_stuck_submitting`), so only a confirmed successful submission ultimately consumes a credit. **A row stuck in `submitting` past the cutoff is moved to TERMINAL `failed` (not back to `approved`) — it may have submitted externally, so it is never auto-resubmitted and requires manual reconciliation; the expiry writes a `submission_attempt` event with `outcome='unconfirmed'` and refunds the correct per-user credit count** | ADR-006, BR-136 |
| BR-148 | Clients may only create the user-owned queue statuses (`pending_approval`/`approved`) or move a row to `cancelled`; `submitting`/`submitted`/`failed` are written exclusively by the service-role worker, which re-validates every guardrail server-side regardless of the client-supplied `status`/`queued_by`. **The worker additionally enforces application ownership (the queued `application_id` must belong to the queue row's `user_id`) at claim time (returns `not_owned`), and RLS defense-in-depth requires the inserted `application_id` to belong to `auth.uid()`** | ADR-006, BR-131, BR-133, BR-005 |

---

## Server-Side AI Scoring & Generation (ADR-007 / ADR-008)

| ID | Rule | Source |
| --- | --- | --- |
| BR-140 | Real match scoring runs through the thin `score-job-fit` Edge Function (routed `match_scoring` → Claude Opus 4.6 / anthropic). The function performs no DB writes and uses no service-role key; cost-gating, `ai_scores` persistence, and `ai_model_usage` logging stay client-side in `aiScoringService` | ADR-007, BR-103, BR-122 |
| BR-141 | When `match_scoring` is blocked by the cost cap (BR-052) or the `score-job-fit` call errors, the deterministic heuristic (`pipelineService.scoreJobFit`) is persisted as the fallback, flagged in `ai_scores.reasoning_trace` with `source = 'heuristic_fallback'` and a `reason` (`cost_cap` / `edge_function_error`), so the dashboard always receives a score | ADR-007, BR-052, BR-024 |
| BR-142 | The persisted recommendation is always derived from `overall_score` via the BR-020/021/022 thresholds (`getScoreLabel` / `toDbRecommendation`); the LLM's own recommendation is advisory only and is never persisted as-is — no threshold literals live outside `aiScoringService` | ADR-007, BR-020, BR-021, BR-022, AI-RULE-001 |
| BR-143 | Document generation runs through the thin `generate-document` Edge Function (routed `cover_letter_generation` → anthropic Opus, `resume_rewriting` → openai GPT-5). The function performs no DB writes and uses no service-role key; cost-gating, persistence, and usage logging stay client-side in `documentGenerationService`. On any Edge error the deterministic template builder is the fallback, flagged `metadata.source = 'template_fallback'` | ADR-008, BR-122, BR-052 |
| BR-144 | Generated documents are persisted to the `documents` table only when persistence is explicitly requested (the DocBuilder align path), reusing `documentStorageService.createDocumentVersion` (Storage + versioned row, content_hash, RLS, BR-070/071); the submission-packet flow persists and links separately, so generation never double-writes | ADR-008, BR-070, BR-071, BR-007 |
| BR-145 | The auto-apply dashboard "Applications Submitted" stat is derived from `applications` DB truth — an application counts as submitted when `submitted_at` is set or its stage is a post-`discovery` happy-path stage (applied … hired) — never from client/localStorage state; demo mode shows a stable seed figure | BR-135, BR-013 |

---

## Manual Apply & Apply-Macro Rules (ADR-009)

| ID | Rule | Source |
| --- | --- | --- |
| BR-149 | In `review`/`assist` (Hybrid) modes, the Dashboard green "Apply" and the dashboard JD-sidebar Apply buttons open the job's `source_url` in a new tab and move the application to a view-model **Manual / In-progress** status. The application's `stage` stays `discovery`; the in-progress marker is a client-written `application_events` row (`event_type='submission_attempt'`, `actor='jb_manual'`, `metadata.outcome='in_progress'`, `metadata.source='manual-apply'`). A follow-up **"Mark as applied"** action fires the audited `discovery → applied` transition via the `transition_stage` RPC. No new pipeline stage is introduced (BR-002/BR-013 unaffected); in `auto` mode the button keeps its existing auto-apply behavior | ADR-009, BR-002, BR-130, BR-135 |
| BR-150 | Match-scoring **input** prefers the user's uploaded master-resume text (read from the `documents` bucket when a `.txt` resume exists, via `fetchCandidateResumeText`) over the hardcoded `masterProfile` keyword set; when no extractable text exists it falls back to the keyword profile (no client-side PDF parsing). Resume text is length-capped (≈12k chars) to bound `tokens_in`; the `$75/user/month` cost cap (BR-052) and the heuristic fallback (BR-141) are unchanged. Populating a pre-extracted `master_resume_text` via real PDF extraction is a documented follow-up | ADR-009, ADR-007, BR-140, BR-141 |
| BR-151 | The Apply-Macro browser extension is **human-in-the-loop only**: it autofills ATS form fields from the user's own (RLS-scoped) profile/resume but **never auto-submits** (`submit.autoClick = false`), never bypasses CAPTCHAs, auth walls, or rate limits, and embeds **no** LLM or service-role key — match scoring is brokered through the JWT-gated `score-job-fit` Edge Function (keys stay Supabase secrets). Anything the macro cannot complete is left for the human. This complements, and does not reverse, ADR-006's deferral of autonomous browser submission | ADR-009, BR-032, BR-033, BR-034, BR-122 |
