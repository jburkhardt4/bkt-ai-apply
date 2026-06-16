# Data Objects — BKT AI-Apply

Core entities / DTOs / enums the business rules operate on. Source-cited; field lists are the business-relevant subset, not every column.

| Entity | Kind | Source | Fields | Consumed by |
|---|---|---|---|---|
| `BuiltRequest` | dto | `supabase/functions/_shared/submission/types.ts:81-92` | 6 | Shadow-validate artifact saved to submission_previews for human review (BR-146); serializable, NO bytes/secrets |
| `CandidatePayload` | dto | `supabase/functions/_shared/submission/types.ts:61-75` | 11 | Resolved by worker from candidate_profiles + master resume; empty required fields still resolve but adapters' missing[] withholds send (BR-146) |
| `CandidateProfile` | dto | `src/types/pipeline.ts:57-69` | 9 | Client-side scoring/profile shape; constraints.autoApplyThreshold + requireHumanApprovalForSubmit echo review_mode/threshold (server-authoritative per BR-131) |
| `LlmRequest / LlmResponse / LlmUsage` | dto | `supabase/functions/_shared/llm/types.ts:11-45` | 8 | Provider-agnostic LLM contract (BR-122/124); model is ai-router pinned display name resolved to provider API id; usage feeds cost logging |
| `MatchResult / ScoreBreakdown` | dto | `src/types/pipeline.ts:28-43` | 10 | AI scoring output mapped into ai_scores; thresholdPassed/threshold drive recommendation (BR-020/021/022/142) |
| `PersistAiScoreInput` | dto | `src/features/applications/services/aiScoringService.ts:12-21` | 8 | Input to persistAiScore: routes match_scoring, applies cost cap, writes ai_scores + logs ai_model_usage (BR-140/141/054) |
| `SubmissionInput` | dto | `supabase/functions/_shared/submission/types.ts:26-37` | 5 | Worker->adapter input sourced verbatim from claim_submission payload (BR-134/146); drives channel resolution |
| `SubmissionOutcome` | dto | `supabase/functions/_shared/submission/types.ts:46-53` | 4 | Adapter result handed to finalize_submission; success=false fails to manual with reason (BR-146); never throws for expected conditions |
| `AiCostPolicyStatus / AiCostDecision` | enum | `src/types/pipeline.ts:90-96 + src/lib/ai-router.ts:87-139` | 5 | Cost-cap evaluation (BR-050/051/052/053); thresholds $60(80%)/$67.50(90%)/$75(cap) |
| `AiTaskType` | enum | `src/types/pipeline.ts:71-82` | 11 | Keys the ROUTING_MATRIX in ai-router.ts (model + provider + isCritical per task) |
| `MatchRecommendation / MatchRecommendationLabel` | enum | `src/types/pipeline.ts:86-88 + src/features/applications/services/aiScoringService.ts:23-45` | 3 | getScoreLabel/toDbRecommendation derive label+db recommendation from overall_score (BR-142); only place threshold literals 60/80 live |
| `PipelineStage` | enum | `src/types/pipeline.ts:1-10` | 9 | Canonical pipeline stage union (BR-013); legal transitions defined in stageRules.ts defaultTransitions (BR-011: one-directional except ghosted->applied) |
| `SubmissionChannel / AtsVendor` | enum | `supabase/functions/_shared/submission/types.ts:16-19` | 2 | Channel resolution (BR-134); api/ats route to ATS adapters, browser via Browserbase+Stagehand, manual fails to recorded reason |
| `ChatModelOption / CHAT_MODEL_CATALOG` | record | `src/lib/ai-router.ts:187-226` | 4 | User-selectable chat models (BR-120/121/125); unknown name falls back to general_qa default (never forwarded to provider) |
| `ModelPricing / MODEL_PRICING_BY_NAME` | record | `src/lib/ai-router.ts:256-282` | 2 | Cost logging to ai_model_usage (BR-054); FALLBACK_PRICING applied to unlisted models so logging never records $0 |
| `RoutingEntry / ROUTING_MATRIX` | record | `src/lib/ai-router.ts:11-85` | 4 | Model routing per task type; isCritical flag drives cost-cap exemption (BR-052/053) |
| `ai_model_usage` | table | `supabase/migrations/20260603000014_create_ai_model_usage.sql:11-25` | 10 | AI cost cap accounting (BR-050/051/052/053/054); monthly UTC rollup feeds getMonthlyAiSpendUsd; immutable |
| `ai_scores` | table | `supabase/migrations/20260603000007_create_ai_scores.sql:10-33` | 15 | AI match scoring (BR-020/021/022/024/025/140/141/142); recommendation derived from overall_score via thresholds; heuristic fallback flagged in reasoning_trace; immutable (re-score = new row) |
| `application_events` | table | `supabase/migrations/20260603000010_create_application_events.sql:28-75` | 11 | Immutable system-of-record for all state changes (BR-002/003); score overrides (BR-023), approvals, submission attempts; audit-log views sort created_at DESC (BR-090); pipeline card last_event (BR-091); authorization-to-submit source (BR-131) |
| `application_materials` | table | `supabase/migrations/20260603000009_create_application_materials.sql:9-20` | 6 | Links documents to applications; INSERT locks the document via fn_lock_linked_document (BR-007/072); RLS via parent application ownership |
| `application_queue` | table | `supabase/migrations/20260612000004_create_application_queue.sql:13-32` | 12 | Auto-submission workflow state (BR-130/131/133/136/146/147/148); one row per application; client may create pending_approval/approved & cancel; worker (service role) owns submitting/submitted/failed |
| `applications` | table | `supabase/migrations/20260603000008_create_applications.sql:20-47` | 9 | Pipeline stage lifecycle (BR-002/010/011/012/013/135/145), stage-transition RPC, aiScoringService (match_score 60/80), submission worker (discovery->applied on success), event sourcing safety-net trigger |
| `candidate_profiles` | table | `supabase/migrations/20260614000001_candidate_profiles_and_previews.sql:20-37` | 13 | Source-of-truth PII for ATS submission (resolveCandidatePayload); empty required fields fail-safe via adapters missing[] (BR-146) |
| `chat_conversations` | table | `supabase/migrations/20260608000001_create_chat.sql:13-19` | 5 | Assistant conversation grouping (BR-110); delete cascades to messages (BR-114) |
| `chat_memory` | table | `supabase/migrations/20260608000001_create_chat.sql:73-81` | 7 | Long-term assistant memory injected into system prompt (BR-113); written on MEMORY: directive; source_conversation_id set NULL on conversation delete (BR-114) |
| `chat_messages` | table | `supabase/migrations/20260608000001_create_chat.sql:43-51` | 7 | Conversational assistant persistence (BR-110/112); a capped turn persists a 'deferred' assistant message |
| `companies` | table | `supabase/migrations/20260603000003_create_companies.sql:10-19` | 8 | Shared company lookup referenced by jobs; sender-to-company matching for email persistence (BR-035); no user_id (not user-scoped) |
| `documents` | table | `supabase/migrations/20260603000006_create_documents.sql:9-21` | 8 | Resume/cover-letter versioning + immutability (BR-007/070/071/072/144); locked docs blocked by fn_guard_locked_document trigger |
| `emails` | table | `supabase/migrations/20260603000011_create_emails.sql:10-34 + 20260613000001_create_gmail_label_map.sql:10-12` | 14 | Gmail ingestion + classification (BR-030/031/035/036/037); confidence>=0.70 gates auto-action; dedup by (user_id, gmail_message_id); offer-protection (BR-012) |
| `gmail_label_map` | table | `supabase/migrations/20260613000001_create_gmail_label_map.sql:15-33 (consolidated 20260613000003)` | 6 | Authoritative label-driven classification at confidence 0.95 source='gmail_label' (BR-037); BR-035 force-store; user-editable config |
| `gmail_sync_state` | table | `supabase/migrations/20260612000003_create_gmail_sync_state.sql:10-22` | 8 | Incremental Gmail ingestion cursor (BR-036); cursor held back on truncated run; all writes via gmail-sync Edge Function (service role); client select-only |
| `interviews` | table | `supabase/migrations/20260603000012_create_interviews.sql:8-23` | 12 | Calendar-scraper-driven interview tracking; status transitions; dedup by calendar_event_id; feeds interview_scheduled/complete stages |
| `jobs` | table | `supabase/migrations/20260603000004_create_jobs.sql:8-29 + 20260607000003_jobs_add_job_type.sql:15 + 20260614000003_jobs_add_description_formatted.sql` | 17 | Job ingestion + dedup by source_url (BR-063/102/063), prospector ingest (source='prospector', BR-105), match scoring inputs, submission channel resolution (source_url + application_method), Ready-to-Apply queue |
| `notifications` | table | `supabase/migrations/20260603000013_create_notifications.sql:8-24 + 20260613000002 + 20260614000002` | 8 | Cost alerts at 90% (BR-051), approval-needed, email_sent audit (BR-038), auto_submitted; client UPDATE limited to mark-read |
| `prospecting_profiles` | table | `supabase/migrations/20260607000001_add_prospecting_tables.sql:17-68` | 13 | Prospector cron config (BR-100/101/105/107); one profile per user; array-element validation trigger; is_active gates cron runs |
| `prospecting_runs` | table | `supabase/migrations/20260607000001_add_prospecting_tables.sql:155-186` | 8 | Prospector run audit (BR-100/104/106); append-only; status='empty' for zero results; jobs_queued<=jobs_found |
| `saved_jobs` | table | `supabase/migrations/20260612000002_create_saved_jobs.sql:9-16` | 4 | User bookmarks; UNIQUE(user_id,job_id) — one bookmark per job; insert/delete only (no mutation) |
| `submission_previews` | table | `supabase/migrations/20260614000001_candidate_profiles_and_previews.sql:63-81` | 13 | Shadow-validate artifacts — the would-be ATS request for human review before first real send (BR-146); written by worker (service role), no secrets |
| `user_settings` | table | `supabase/migrations/20260612000001_create_user_settings.sql:10-28` | 10 | Server-side submission autonomy guardrails (BR-130/131/132/136); auto-provisioned per user; CHECK bounds on every threshold |
| `users` | table | `supabase/migrations/20260603000001_create_users.sql:22-29` | 6 | Identity anchor for every user_id FK and RLS user-scoping (BR-005); auto-provisioned from auth.users; triggers provision user_settings |


### `AiCostPolicyStatus / AiCostDecision`  *(enum)*
**Source:** `src/types/pipeline.ts:90-96 + src/lib/ai-router.ts:87-139`
**Consumed/produced by:** Cost-cap evaluation (BR-050/051/052/053); thresholds $60(80%)/$67.50(90%)/$75(cap)

| Field | Type | Note |
|---|---|---|
| `ok` | `literal` | < $60 |
| `warn_80` | `literal` | >= $60 (AI_WARNING_80_PERCENT_USD) |
| `warn_90` | `literal` | >= $67.50 — JB notified (BR-051) |
| `capped_non_critical` | `literal` | >= $75 and not critical — shouldBlock=true (BR-052) |
| `capped_critical_override` | `literal` | >= $75 but critical — shouldBlock=false (BR-053) |


### `AiTaskType`  *(enum)*
**Source:** `src/types/pipeline.ts:71-82`
**Consumed/produced by:** Keys the ROUTING_MATRIX in ai-router.ts (model + provider + isCritical per task)

| Field | Type | Note |
|---|---|---|
| `cover_letter_generation` | `literal` | Claude Opus 4.6 / anthropic |
| `interview_prep` | `literal` | Claude Opus 4.6 |
| `match_scoring` | `literal` | Claude Opus 4.6 (BR-103/140) |
| `resume_rewriting` | `literal` | GPT-5 / openai |
| `browser_form_automation` | `literal` | GPT-5 |
| `company_market_research` | `literal` | Gemini 2.5 Pro |
| `email_classification` | `literal` | Gemini 2.5 Flash; isCritical=true — never blocked by cost cap (BR-053) |
| `email_draft` | `literal` | Gemini 2.5 Flash |
| `intent_routing` | `literal` | Gemini 2.5 Flash |
| `general_qa` | `literal` | Claude Sonnet 4.6 (chat default, BR-112) |
| `jd_formatting` | `literal` | Claude 3.5 Haiku |


### `BuiltRequest`  *(dto)*
**Source:** `supabase/functions/_shared/submission/types.ts:81-92`
**Consumed/produced by:** Shadow-validate artifact saved to submission_previews for human review (BR-146); serializable, NO bytes/secrets

| Field | Type | Note |
|---|---|---|
| `channel` | `api\|ats\|browser\|manual` |  |
| `vendor` | `AtsVendor\|null` |  |
| `endpoint` | `string\|null` | URL that WOULD be POSTed |
| `payload` | `Record<string,unknown>` | fields that WOULD be sent (no resume bytes, no secrets) |
| `resumePath` | `string\|null` |  |
| `missing` | `string[]` | unfillable required fields — blocks a real send |


### `CandidatePayload`  *(dto)*
**Source:** `supabase/functions/_shared/submission/types.ts:61-75`
**Consumed/produced by:** Resolved by worker from candidate_profiles + master resume; empty required fields still resolve but adapters' missing[] withholds send (BR-146)

| Field | Type | Note |
|---|---|---|
| `firstName` | `string` |  |
| `lastName` | `string` |  |
| `fullName` | `string` |  |
| `email` | `string` | PII |
| `phone` | `string` | PII |
| `location` | `string` |  |
| `linkedinUrl` | `string\|null` |  |
| `websiteUrl` | `string\|null` |  |
| `workAuthorization` | `string` |  |
| `resume` | `{bytes,filename,contentType}\|null` | null when no master PDF — withholds real send |
| `resumePath` | `string\|null` |  |


### `CandidateProfile`  *(dto)*
**Source:** `src/types/pipeline.ts:57-69`
**Consumed/produced by:** Client-side scoring/profile shape; constraints.autoApplyThreshold + requireHumanApprovalForSubmit echo review_mode/threshold (server-authoritative per BR-131)

| Field | Type | Note |
|---|---|---|
| `fullName` | `string` |  |
| `targetLocation` | `string` |  |
| `seniorityKeywords` | `string[]` |  |
| `skillKeywords` | `string[]` |  |
| `domainKeywords` | `string[]` |  |
| `toolingKeywords` | `string[]` |  |
| `quantifiedOutcomes` | `string[]` |  |
| `constraints.requireHumanApprovalForSubmit` | `boolean` |  |
| `constraints.autoApplyThreshold` | `number` |  |


### `ChatModelOption / CHAT_MODEL_CATALOG`  *(record)*
**Source:** `src/lib/ai-router.ts:187-226`
**Consumed/produced by:** User-selectable chat models (BR-120/121/125); unknown name falls back to general_qa default (never forwarded to provider)

| Field | Type | Note |
|---|---|---|
| `modelName` | `string` | pinned display name |
| `provider` | `anthropic\|openai\|google` |  |
| `label` | `string` |  |
| `description` | `string` |  |


### `LlmRequest / LlmResponse / LlmUsage`  *(dto)*
**Source:** `supabase/functions/_shared/llm/types.ts:11-45`
**Consumed/produced by:** Provider-agnostic LLM contract (BR-122/124); model is ai-router pinned display name resolved to provider API id; usage feeds cost logging

| Field | Type | Note |
|---|---|---|
| `model` | `string` | ai-router pinned display name e.g. 'Claude Sonnet 4.6' |
| `system` | `string` |  |
| `messages` | `ChatTurn[]` | role user\|assistant |
| `maxTokens` | `number` |  |
| `thinkingBudget` | `number (optional)` | Gemini-only; 0 disables thinking for fast structured tasks |
| `usage.input_tokens` | `number` |  |
| `usage.output_tokens` | `number` |  |
| `response.text` | `string` |  |


### `MatchRecommendation / MatchRecommendationLabel`  *(enum)*
**Source:** `src/types/pipeline.ts:86-88 + src/features/applications/services/aiScoringService.ts:23-45`
**Consumed/produced by:** getScoreLabel/toDbRecommendation derive label+db recommendation from overall_score (BR-142); only place threshold literals 60/80 live

| Field | Type | Note |
|---|---|---|
| `apply / Auto-Submit Prep` | `literal` | >= 80 (BR-021) |
| `consider / Consideration` | `literal` | >= 60 (BR-020) |
| `reject / Reject` | `literal` | < 60 (BR-022) |


### `MatchResult / ScoreBreakdown`  *(dto)*
**Source:** `src/types/pipeline.ts:28-43`
**Consumed/produced by:** AI scoring output mapped into ai_scores; thresholdPassed/threshold drive recommendation (BR-020/021/022/142)

| Field | Type | Note |
|---|---|---|
| `overall` | `number` | 0-100; thresholds 60/80 |
| `thresholdPassed` | `boolean` |  |
| `threshold` | `number` |  |
| `breakdown.skills` | `number` |  |
| `breakdown.domain` | `number` |  |
| `breakdown.seniority` | `number` |  |
| `breakdown.tools` | `number` |  |
| `breakdown.locationAuth` | `number` | remote/hybrid/anywhere/US/target-metro = 10, else 5 baseline (BR-025) |
| `strengths` | `string[]` |  |
| `gaps` | `string[]` |  |


### `ModelPricing / MODEL_PRICING_BY_NAME`  *(record)*
**Source:** `src/lib/ai-router.ts:256-282`
**Consumed/produced by:** Cost logging to ai_model_usage (BR-054); FALLBACK_PRICING applied to unlisted models so logging never records $0

| Field | Type | Note |
|---|---|---|
| `inputUsdPerToken` | `number` | e.g. Claude Opus 4.6 = 15/1M; Gemini Flash = 0.3/1M |
| `outputUsdPerToken` | `number` | e.g. Claude Opus 4.6 = 75/1M; Gemini Flash = 2.5/1M |


### `PersistAiScoreInput`  *(dto)*
**Source:** `src/features/applications/services/aiScoringService.ts:12-21`
**Consumed/produced by:** Input to persistAiScore: routes match_scoring, applies cost cap, writes ai_scores + logs ai_model_usage (BR-140/141/054)

| Field | Type | Note |
|---|---|---|
| `userId` | `string` |  |
| `jobId` | `string` |  |
| `match` | `MatchResult` |  |
| `reasoningTrace` | `Json` | stores heuristic_fallback source/reason |
| `tokensIn` | `number` |  |
| `tokensOut` | `number` |  |
| `estimatedCostUsd` | `number` |  |
| `applicationId` | `string (optional)` |  |


### `PipelineStage`  *(enum)*
**Source:** `src/types/pipeline.ts:1-10`
**Consumed/produced by:** Canonical pipeline stage union (BR-013); legal transitions defined in stageRules.ts defaultTransitions (BR-011: one-directional except ghosted->applied)

| Field | Type | Note |
|---|---|---|
| `discovery` | `literal` | default ingest stage (BR-010) |
| `applied` | `literal` |  |
| `screening` | `literal` |  |
| `interview_scheduled` | `literal` |  |
| `interview_complete` | `literal` |  |
| `offer` | `literal` | protected: rejection email does not auto-overwrite (BR-012) |
| `hired` | `literal` | terminal |
| `rejected` | `literal` | terminal |
| `ghosted` | `literal` | only stage that may return to applied (BR-011) |


### `RoutingEntry / ROUTING_MATRIX`  *(record)*
**Source:** `src/lib/ai-router.ts:11-85`
**Consumed/produced by:** Model routing per task type; isCritical flag drives cost-cap exemption (BR-052/053)

| Field | Type | Note |
|---|---|---|
| `taskType` | `AiTaskType` |  |
| `modelName` | `string` | pinned display name — single source of truth |
| `modelProvider` | `anthropic\|openai\|google` |  |
| `isCritical` | `boolean` | true only for email_classification — never blocked at cap (BR-053) |


### `SubmissionChannel / AtsVendor`  *(enum)*
**Source:** `supabase/functions/_shared/submission/types.ts:16-19`
**Consumed/produced by:** Channel resolution (BR-134); api/ats route to ATS adapters, browser via Browserbase+Stagehand, manual fails to recorded reason

| Field | Type | Note |
|---|---|---|
| `SubmissionChannel` | `api\|ats\|browser\|manual` |  |
| `AtsVendor` | `greenhouse\|lever\|ashby` | vendors with documented public application endpoints (GAP-010) |


### `SubmissionInput`  *(dto)*
**Source:** `supabase/functions/_shared/submission/types.ts:26-37`
**Consumed/produced by:** Worker->adapter input sourced verbatim from claim_submission payload (BR-134/146); drives channel resolution

| Field | Type | Note |
|---|---|---|
| `applicationId` | `string` | applications.id |
| `jobId` | `string` | jobs.id |
| `sourceUrl` | `string` | drives ATS vendor detection |
| `applicationMethod` | `string\|null` | api\|ats\|manual |
| `queuedBy` | `string` | user\|assist_mode\|auto_mode (audit-only) |


### `SubmissionOutcome`  *(dto)*
**Source:** `supabase/functions/_shared/submission/types.ts:46-53`
**Consumed/produced by:** Adapter result handed to finalize_submission; success=false fails to manual with reason (BR-146); never throws for expected conditions

| Field | Type | Note |
|---|---|---|
| `success` | `boolean` |  |
| `channel` | `api\|ats\|browser\|manual` |  |
| `error` | `string (optional)` | machine-readable e.g. channel_not_configured |
| `metadata` | `Record<string,unknown> (optional)` | vendor, session id, screenshot URL — folded into application_events |


### `ai_model_usage`  *(table)*
**Source:** `supabase/migrations/20260603000014_create_ai_model_usage.sql:11-25`
**Consumed/produced by:** AI cost cap accounting (BR-050/051/052/053/054); monthly UTC rollup feeds getMonthlyAiSpendUsd; immutable

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `model_provider` | `text enum NOT NULL` | CHECK in openai\|anthropic\|google |
| `model_name` | `text NOT NULL` |  |
| `task_type` | `text NOT NULL` | AiTaskType value |
| `tokens_in` | `integer >=0` |  |
| `tokens_out` | `integer >=0` |  |
| `estimated_cost_usd` | `numeric(10,6) >=0` | summed per UTC month vs $75 cap (BR-050) |
| `application_id` | `uuid (nullable)` | FK applications ON DELETE SET NULL |
| `called_at` | `timestamptz` | UTC month-bucket index for cost rollup |


### `ai_scores`  *(table)*
**Source:** `supabase/migrations/20260603000007_create_ai_scores.sql:10-33`
**Consumed/produced by:** AI match scoring (BR-020/021/022/024/025/140/141/142); recommendation derived from overall_score via thresholds; heuristic fallback flagged in reasoning_trace; immutable (re-score = new row)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `job_id` | `uuid` | FK jobs ON DELETE CASCADE |
| `overall_score` | `integer 0-100 NOT NULL` | CHECK 0-100; thresholds 60/80 (BR-020/021/022) |
| `skills_score` | `integer 0-100` |  |
| `domain_score` | `integer 0-100` |  |
| `seniority_score` | `integer 0-100` |  |
| `tools_score` | `integer 0-100` |  |
| `location_auth_score` | `integer 0-100` |  |
| `recommendation` | `text enum NOT NULL` | CHECK in apply\|consider\|reject; ALWAYS derived from overall_score (BR-142), never the LLM's own |
| `strengths` | `text[]` |  |
| `gaps` | `text[]` |  |
| `model_used` | `text NOT NULL` |  |
| `reasoning_trace` | `jsonb NOT NULL` | stores source='heuristic_fallback' with reason=cost_cap\|edge_function_error (BR-024/141) |
| `scored_at` | `timestamptz` |  |


### `application_events`  *(table)*
**Source:** `supabase/migrations/20260603000010_create_application_events.sql:28-75`
**Consumed/produced by:** Immutable system-of-record for all state changes (BR-002/003); score overrides (BR-023), approvals, submission attempts; audit-log views sort created_at DESC (BR-090); pipeline card last_event (BR-091); authorization-to-submit source (BR-131)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK users |
| `application_id` | `uuid` | FK applications ON DELETE CASCADE |
| `event_type` | `text enum` | CHECK in stage_transition\|score_override\|approval\|rejection\|email_classified\|interview_scheduled\|interview_complete\|offer_received\|submission_attempt\|document_linked\|note_added\|system_alert |
| `from_stage` | `text enum (nullable)` | pipeline stage enum |
| `to_stage` | `text enum (nullable)` | pipeline stage enum |
| `actor` | `text enum` | CHECK in system\|system_trigger\|jb_manual\|gmail_scraper\|calendar_scraper\|claude-opus-4\|claude-sonnet-4-5\|gpt-4o\|gpt-5\|gemini-2-5-pro\|gemini-2-5-flash (BR-023 actor='jb_manual' for overrides) |
| `reason` | `text` | required for score override (BR-023) |
| `metadata` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `_immutability` | `constraint` | NO UPDATE/DELETE RLS policies; fn_deny_application_event_mutation BEFORE UPDATE/DELETE triggers raise exception (BR-003, SEC-007) |


### `application_materials`  *(table)*
**Source:** `supabase/migrations/20260603000009_create_application_materials.sql:9-20`
**Consumed/produced by:** Links documents to applications; INSERT locks the document via fn_lock_linked_document (BR-007/072); RLS via parent application ownership

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `application_id` | `uuid` | FK applications ON DELETE CASCADE |
| `document_id` | `uuid` | FK documents ON DELETE RESTRICT; UNIQUE(application_id,document_id) |
| `material_type` | `text enum NOT NULL` | CHECK in resume\|cover_letter\|attachment |
| `is_primary` | `boolean` | DEFAULT false |
| `linked_at` | `timestamptz` |  |


### `application_queue`  *(table)*
**Source:** `supabase/migrations/20260612000004_create_application_queue.sql:13-32`
**Consumed/produced by:** Auto-submission workflow state (BR-130/131/133/136/146/147/148); one row per application; client may create pending_approval/approved & cancel; worker (service role) owns submitting/submitted/failed

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `application_id` | `uuid` | UNIQUE — one queue row per application ever (BR-133) |
| `status` | `text enum` | CHECK in pending_approval\|approved\|submitting\|submitted\|failed\|cancelled; client RLS limits insert to pending_approval\|approved and update to approved/cancelled (BR-148) |
| `queued_by` | `text enum` | CHECK in user\|assist_mode\|auto_mode (BR-130); AUDIT-ONLY — never trusted for authorization (BR-131) |
| `channel` | `text enum (nullable)` | CHECK in api\|ats\|browser\|manual; resolved by worker (BR-134) |
| `attempts` | `integer >=0` |  |
| `last_attempt_at` | `timestamptz` |  |
| `last_error` | `text` |  |
| `submitted_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `applications`  *(table)*
**Source:** `supabase/migrations/20260603000008_create_applications.sql:20-47`
**Consumed/produced by:** Pipeline stage lifecycle (BR-002/010/011/012/013/135/145), stage-transition RPC, aiScoringService (match_score 60/80), submission worker (discovery->applied on success), event sourcing safety-net trigger

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK users; RLS scoping (BR-005) |
| `job_id` | `uuid` | FK jobs ON DELETE RESTRICT; UNIQUE(user_id,job_id) — one application per user per job |
| `stage` | `text enum` | CHECK in discovery\|applied\|screening\|interview_scheduled\|interview_complete\|offer\|hired\|rejected\|ghosted; DEFAULT 'discovery' (BR-010/013); changes must write application_events (BR-002), safety-net AFTER UPDATE trigger fn_log_stage_transition |
| `match_score` | `integer 0-100` | CHECK BETWEEN 0 AND 100; drives BR-020(>=60)/BR-021(>=80)/BR-022(<60) |
| `submitted_at` | `timestamptz` | set on confirmed submission; feeds 'Applications Submitted' stat (BR-145) |
| `notes` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` | maintained by trg_applications_updated_at |


### `candidate_profiles`  *(table)*
**Source:** `supabase/migrations/20260614000001_candidate_profiles_and_previews.sql:20-37`
**Consumed/produced by:** Source-of-truth PII for ATS submission (resolveCandidatePayload); empty required fields fail-safe via adapters missing[] (BR-146)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK auth.users; UNIQUE one per user |
| `full_name` | `text` |  |
| `email` | `text` | PII — required by ATS forms; masked in any output |
| `phone` | `text` | PII |
| `location` | `text` |  |
| `linkedin_url` | `text (nullable)` |  |
| `website_url` | `text (nullable)` |  |
| `work_authorization` | `text` |  |
| `master_resume_path` | `text (nullable)` | storage path in documents bucket to master resume PDF |
| `eeo_disclosures` | `jsonb` | voluntary EEO answers; default decline |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `chat_conversations`  *(table)*
**Source:** `supabase/migrations/20260608000001_create_chat.sql:13-19`
**Consumed/produced by:** Assistant conversation grouping (BR-110); delete cascades to messages (BR-114)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `title` | `text` | DEFAULT 'New chat' |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `chat_memory`  *(table)*
**Source:** `supabase/migrations/20260608000001_create_chat.sql:73-81`
**Consumed/produced by:** Long-term assistant memory injected into system prompt (BR-113); written on MEMORY: directive; source_conversation_id set NULL on conversation delete (BR-114)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `content` | `text NOT NULL` |  |
| `kind` | `text` | DEFAULT 'fact' |
| `source_conversation_id` | `uuid (nullable)` | FK chat_conversations ON DELETE SET NULL (BR-114) |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `chat_messages`  *(table)*
**Source:** `supabase/migrations/20260608000001_create_chat.sql:43-51`
**Consumed/produced by:** Conversational assistant persistence (BR-110/112); a capped turn persists a 'deferred' assistant message

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `conversation_id` | `uuid` | FK chat_conversations ON DELETE CASCADE (BR-114) |
| `user_id` | `uuid` |  |
| `role` | `text enum NOT NULL` | CHECK in user\|assistant\|system |
| `content` | `text NOT NULL` |  |
| `metadata` | `jsonb` |  |
| `created_at` | `timestamptz` |  |


### `companies`  *(table)*
**Source:** `supabase/migrations/20260603000003_create_companies.sql:10-19`
**Consumed/produced by:** Shared company lookup referenced by jobs; sender-to-company matching for email persistence (BR-035); no user_id (not user-scoped)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `text NOT NULL` |  |
| `domain` | `text` | UNIQUE where not null; drives logo + sender matching |
| `industry` | `text` |  |
| `size_range` | `text` |  |
| `linkedin_url` | `text` |  |
| `notes` | `text` |  |
| `created_at` | `timestamptz` |  |


### `documents`  *(table)*
**Source:** `supabase/migrations/20260603000006_create_documents.sql:9-21`
**Consumed/produced by:** Resume/cover-letter versioning + immutability (BR-007/070/071/072/144); locked docs blocked by fn_guard_locked_document trigger

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `storage_path` | `text NOT NULL` |  |
| `document_type` | `text enum NOT NULL` | CHECK in resume\|cover_letter |
| `version` | `integer` | DEFAULT 1; UNIQUE(user_id,document_type,version) — versioned per user+type (BR-070) |
| `content_hash` | `text NOT NULL` | dedup checks |
| `is_locked` | `boolean` | DEFAULT false; true = immutable, update blocked by trigger (BR-007/072) |
| `created_at` | `timestamptz` |  |


### `emails`  *(table)*
**Source:** `supabase/migrations/20260603000011_create_emails.sql:10-34 + 20260613000001_create_gmail_label_map.sql:10-12`
**Consumed/produced by:** Gmail ingestion + classification (BR-030/031/035/036/037); confidence>=0.70 gates auto-action; dedup by (user_id, gmail_message_id); offer-protection (BR-012)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `application_id` | `uuid (nullable)` | FK applications ON DELETE SET NULL; null until matched |
| `gmail_message_id` | `text NOT NULL` | UNIQUE(user_id,gmail_message_id) dedup (BR-036) |
| `from_address` | `text NOT NULL` |  |
| `subject` | `text` |  |
| `body_snippet` | `text` |  |
| `classification` | `text enum NOT NULL` | CHECK in interview_invite\|rejection\|offer\|outreach\|follow_up\|unknown |
| `confidence` | `numeric(4,3)` | CHECK 0.000-1.000; >=0.70 permits auto-transition (BR-030/031) |
| `auto_actioned` | `boolean` | DEFAULT false; true only when confidence>=0.70 |
| `received_at` | `timestamptz NOT NULL` |  |
| `processed_at` | `timestamptz` |  |
| `thread_id` | `text` |  |
| `gmail_labels` | `text[]` | raw Gmail labels at ingest; matched against gmail_label_map (BR-037) |


### `gmail_label_map`  *(table)*
**Source:** `supabase/migrations/20260613000001_create_gmail_label_map.sql:15-33 (consolidated 20260613000003)`
**Consumed/produced by:** Authoritative label-driven classification at confidence 0.95 source='gmail_label' (BR-037); BR-035 force-store; user-editable config

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `gmail_label` | `text NOT NULL` | matched case-insensitively; UNIQUE(user_id,gmail_label) |
| `classification` | `text enum NOT NULL` | CHECK mirrors emails enum: interview_invite\|rejection\|offer\|outreach\|follow_up\|unknown ('Hired' maps to offer; 'Action Required' maps to unknown) |
| `display_label` | `text NOT NULL` | inbox chip id |
| `created_at` | `timestamptz` |  |


### `gmail_sync_state`  *(table)*
**Source:** `supabase/migrations/20260612000003_create_gmail_sync_state.sql:10-22`
**Consumed/produced by:** Incremental Gmail ingestion cursor (BR-036); cursor held back on truncated run; all writes via gmail-sync Edge Function (service role); client select-only

| Field | Type | Note |
|---|---|---|
| `user_id` | `uuid` | PK = FK users |
| `history_id` | `text` | Gmail history cursor for incremental sync |
| `last_synced_at` | `timestamptz` |  |
| `last_status` | `text enum` | CHECK in success\|partial\|error\|noop |
| `last_error` | `text` |  |
| `watch_expiration` | `timestamptz` | reserved for push-webhook phase |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `interviews`  *(table)*
**Source:** `supabase/migrations/20260603000012_create_interviews.sql:8-23`
**Consumed/produced by:** Calendar-scraper-driven interview tracking; status transitions; dedup by calendar_event_id; feeds interview_scheduled/complete stages

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `application_id` | `uuid` | FK applications ON DELETE CASCADE |
| `calendar_event_id` | `text (nullable)` | UNIQUE(user_id,calendar_event_id) where not null — dedup |
| `interview_type` | `text enum NOT NULL` | CHECK in phone\|video\|onsite\|panel |
| `scheduled_at` | `timestamptz NOT NULL` |  |
| `duration_minutes` | `integer >0` |  |
| `location_or_link` | `text` |  |
| `interviewer_names` | `text[]` |  |
| `status` | `text enum` | CHECK in scheduled\|complete\|cancelled\|rescheduled |
| `notes` | `text` |  |
| `created_at` | `timestamptz` |  |


### `jobs`  *(table)*
**Source:** `supabase/migrations/20260603000004_create_jobs.sql:8-29 + 20260607000003_jobs_add_job_type.sql:15 + 20260614000003_jobs_add_description_formatted.sql`
**Consumed/produced by:** Job ingestion + dedup by source_url (BR-063/102/063), prospector ingest (source='prospector', BR-105), match scoring inputs, submission channel resolution (source_url + application_method), Ready-to-Apply queue

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK users; RLS scoping |
| `company_id` | `uuid` | FK companies ON DELETE RESTRICT (nullable) |
| `title` | `text NOT NULL` |  |
| `location` | `text` |  |
| `remote_type` | `text enum` | CHECK in remote\|hybrid\|onsite; feeds locationAuth score (BR-025) |
| `compensation_min` | `integer >=0` |  |
| `compensation_max` | `integer >=0` | CHECK max>=min when both present |
| `description` | `text` |  |
| `skills` | `text[]` | GIN-indexed; feeds skills match (BR-025) |
| `source` | `text` | ='prospector' surfaces in Ready-to-Apply (BR-105) |
| `source_url` | `text NOT NULL` | UNIQUE index — dedup ingestion (BR-063/102); drives ATS vendor detection |
| `application_method` | `text enum` | CHECK in api\|manual\|ats; drives submission channel (BR-134) |
| `job_type` | `text (nullable)` | SerpApi schedule_type: Full-time\|Contractor\|Part-time\|Internship |
| `posted_at` | `timestamptz` |  |
| `expires_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |


### `notifications`  *(table)*
**Source:** `supabase/migrations/20260603000013_create_notifications.sql:8-24 + 20260613000002 + 20260614000002`
**Consumed/produced by:** Cost alerts at 90% (BR-051), approval-needed, email_sent audit (BR-038), auto_submitted; client UPDATE limited to mark-read

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `application_id` | `uuid (nullable)` | FK applications ON DELETE SET NULL |
| `notification_type` | `text enum NOT NULL` | CHECK in approval_needed\|stage_change\|ai_signal\|cost_alert (later migrations add email_sent, auto_submitted) |
| `title` | `text NOT NULL` |  |
| `body` | `text` |  |
| `is_read` | `boolean` | DEFAULT false; only field client may UPDATE |
| `created_at` | `timestamptz` |  |


### `prospecting_profiles`  *(table)*
**Source:** `supabase/migrations/20260607000001_add_prospecting_tables.sql:17-68`
**Consumed/produced by:** Prospector cron config (BR-100/101/105/107); one profile per user; array-element validation trigger; is_active gates cron runs

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK auth.users; UNIQUE one_profile_per_user (BR-101) |
| `is_active` | `boolean` | DEFAULT false; false halts cron runs (BR-107) |
| `job_titles` | `text[]` |  |
| `locations` | `text[]` |  |
| `job_types` | `text[]` | trigger-validated elements: full-time\|contract\|part-time |
| `environments` | `text[]` | trigger-validated elements: remote\|hybrid\|in-office |
| `min_salary` | `integer >=0` | salary floor (BR-105) |
| `keywords` | `text[]` | CHECK max 20 elements (BR-105) |
| `last_run_at` | `timestamptz` |  |
| `next_run_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `prospecting_runs`  *(table)*
**Source:** `supabase/migrations/20260607000001_add_prospecting_tables.sql:155-186`
**Consumed/produced by:** Prospector run audit (BR-100/104/106); append-only; status='empty' for zero results; jobs_queued<=jobs_found

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | FK prospecting_profiles ON DELETE CASCADE |
| `user_id` | `uuid` | redundant for direct RLS |
| `run_at` | `timestamptz` |  |
| `jobs_found` | `integer >=0` |  |
| `jobs_queued` | `integer >=0` | CHECK jobs_queued<=jobs_found |
| `status` | `text enum NOT NULL` | CHECK in success\|empty\|partial\|error\|queued (empty=BR-106, queued=cost-cap BR-104) |
| `error` | `text` | populated when status=error\|partial |


### `saved_jobs`  *(table)*
**Source:** `supabase/migrations/20260612000002_create_saved_jobs.sql:9-16`
**Consumed/produced by:** User bookmarks; UNIQUE(user_id,job_id) — one bookmark per job; insert/delete only (no mutation)

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `job_id` | `uuid` | FK jobs ON DELETE CASCADE; UNIQUE(user_id,job_id) |
| `created_at` | `timestamptz` |  |


### `submission_previews`  *(table)*
**Source:** `supabase/migrations/20260614000001_candidate_profiles_and_previews.sql:63-81`
**Consumed/produced by:** Shadow-validate artifacts — the would-be ATS request for human review before first real send (BR-146); written by worker (service role), no secrets

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` |  |
| `application_id` | `uuid` | FK applications; UNIQUE per application |
| `job_id` | `uuid (nullable)` | FK jobs ON DELETE SET NULL |
| `channel` | `text` | DEFAULT 'manual' |
| `vendor` | `text` |  |
| `endpoint` | `text` | URL that WOULD be POSTed |
| `request_payload` | `jsonb` | fields that WOULD be sent (NO secrets, NO resume bytes) |
| `resume_path` | `text` |  |
| `missing` | `jsonb` | required fields the worker could not fill (blocks real send) |
| `status` | `text enum` | CHECK in pending_review\|approved\|rejected |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `user_settings`  *(table)*
**Source:** `supabase/migrations/20260612000001_create_user_settings.sql:10-28`
**Consumed/produced by:** Server-side submission autonomy guardrails (BR-130/131/132/136); auto-provisioned per user; CHECK bounds on every threshold

| Field | Type | Note |
|---|---|---|
| `user_id` | `uuid` | PK = FK users (one row per user) |
| `credits` | `integer >=0` | DEFAULT 141; decremented atomically per submission, refunded on failure (BR-136/147) |
| `monthly_budget_usd` | `integer` | CHECK BETWEEN 20 AND 5000; DEFAULT 240 (BR-136) |
| `review_mode` | `text enum` | CHECK in review\|assist\|auto; DEFAULT 'review' — drives autonomy (BR-130) |
| `paused` | `boolean` | DEFAULT false; true = immediate kill switch (BR-132) |
| `auto_submit_score_threshold` | `integer 0-100` | CHECK 0-100; DEFAULT 80 (BR-021/131) |
| `daily_submission_cap` | `integer` | CHECK BETWEEN 1 AND 50; DEFAULT 10 (BR-131) |
| `last_target_job` | `jsonb` | SearchJob snapshot for doc auto-align |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |


### `users`  *(table)*
**Source:** `supabase/migrations/20260603000001_create_users.sql:22-29`
**Consumed/produced by:** Identity anchor for every user_id FK and RLS user-scoping (BR-005); auto-provisioned from auth.users; triggers provision user_settings

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | PK = FK auth.users ON DELETE CASCADE |
| `email` | `text NOT NULL` | UNIQUE |
| `full_name` | `text` |  |
| `avatar_url` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
