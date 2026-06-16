# Business Rules — BKT AI-Apply (extracted specification)

| | |
|---|---|
| **System** | `bkt-ai-apply` |
| **Generated** | 2026-06-15 |
| **Method** | 3 parallel `business-rules-extractor` lenses (calculation / validation / lifecycle) + DTO catalog; 90 raw rules deduped to 80 distinct |
| **Linkage** | `brRef` ties each card to the canonical `docs/domain/business-rules.md` BR-NNN ids where one exists |
| **Breakdown** | 18 Calculation / 27 Validation / 16 Lifecycle / 19 Policy · 38 P0 / 30 P1 / 12 P2 · 79 High-conf / 1 Medium-conf |

> **P0** rules (money / regulatory / data-integrity) feed the Modernization Brief's behavior contract — they MUST be proven equivalent before any phase ships. **Suspected defects** are flagged inline; the preserve-vs-fix decision is made during transform, not here.

## Summary

| ID | Rule | Cat | Pri | Source | Conf | BR |
|---|---|---|---|---|---|---|
| RULE-001 | AI monthly cost hard cap and warning ladder ⚠️ | Calc | P0 | `src/lib/ai-router.ts:5-7` | H | BR-050, BR-051, BR-052, BR-053 |
| RULE-002 | Email classification auto-action confidence threshold (0.70) | Calc | P0 | `supabase/functions/gmail-sync/logic.ts:50` | H | BR-030, BR-031 |
| RULE-003 | Heuristic job-fit scoring weights and targets (fallback) ⚠️ | Calc | P0 | `src/features/applications/services/pipelineService.ts:33-46` | H | BR-025, BR-141 |
| RULE-004 | Match-score recommendation thresholds (60 / 80) | Calc | P0 | `src/features/applications/services/aiScoringService.ts:23-45` | H | BR-020, BR-021, BR-022, BR-142 |
| RULE-005 | Monthly submission budget cap (1 credit = $1, calendar month) | Calc | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:192-208; supabase/migrations/20260612000001_create_user_settings.sql:15` | H | BR-131, BR-136 |
| RULE-006 | Submission credit charge / refund accounting ⚠️ | Calc | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:251-264` | H | BR-136, BR-147 |
| RULE-007 | Applications-submitted dashboard count derivation | Calc | P1 | `src/features/applications/services/submittedCount.ts:52-81; src/features/applications/services/applicationService.ts:35-57` | H | BR-145, BR-135 |
| RULE-008 | Each submission charges/refunds exactly one credit; credits & monthly budget bounded | Calc | P1 | `supabase/migrations/20260612000001_create_user_settings.sql:13-23; supabase/migrations/20260613000004_submission_worker_rpcs.sql:251-257` | H | BR-136 |
| RULE-009 | Email-to-application matching heuristic score | Calc | P1 | `supabase/functions/gmail-sync/logic.ts:241-316` | H | BR-035, BR-036 |
| RULE-010 | Gmail keyword fallback confidence formula | Calc | P1 | `supabase/functions/gmail-sync/logic.ts:119-150` | H | BR-030 |
| RULE-011 | Gmail mapped-label authoritative confidence (0.95) | Calc | P1 | `supabase/functions/gmail-sync/logic.ts:333-379` | H | BR-037 |
| RULE-012 | Per-model token pricing for AI cost logging | Calc | P1 | `src/lib/ai-router.ts:264-283` | H | BR-054, BR-121 |
| RULE-013 | Prospector salary parsing (K/M suffix expansion) | Calc | P1 | `supabase/functions/prospector-cron/index.ts:88-120` | H | BR-105 |
| RULE-014 | Server-side LLM job-fit score clamping (0-100 integers) | Calc | P1 | `supabase/functions/score-job-fit/index.ts:120-124` | H | BR-140 |
| RULE-015 | Compensation display formatting (K abbreviation) | Calc | P2 | `src/features/jobs/components/prospectorJobFields.ts:17-24; src/features/auto-apply/services/autoApplyService.ts:44-50` | H |  |
| RULE-016 | Prospector relative posted-date parsing | Calc | P2 | `supabase/functions/prospector-cron/index.ts:668-693` | H |  |
| RULE-017 | Relative-time display thresholds | Calc | P2 | `src/features/jobs/components/prospectorJobFields.ts:27-41; src/features/auto-apply/services/autoApplyService.ts:23-36` | H |  |
| RULE-018 | Submitted-count derivation from applications truth (not localStorage) | Calc | P2 | `src/features/applications/services/submittedCount.ts:30-81; src/features/applications/services/applicationService.ts:40-78` | H | BR-145, BR-133 |
| RULE-019 | Approval event requires a linked resume (submission packet prepared) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:599-651` | H | BR-130, BR-131 |
| RULE-020 | Autonomous submission eligibility (review mode + score, server-authoritative) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:221-249` | H | BR-130, BR-131, BR-148 |
| RULE-021 | Candidate completeness gate before any real ATS send | Vali | P0 | `supabase/functions/_shared/submission/atsAdapters.ts:50-59` | H | BR-134 |
| RULE-022 | Credit balance gate (>= 1 credit required to submit) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:169-171` | H | BR-136 |
| RULE-023 | Daily submission cap (rolling 24h, includes in-flight) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:174-190` | H | BR-131, BR-136 |
| RULE-024 | gmail-send is JWT-verified, user-scoped, never autonomous | Vali | P0 | `supabase/functions/gmail-send/index.ts:215-309` | H | BR-038 |
| RULE-025 | gmail-sync has NO auth gate; only a 60-second re-invocation time guard ⚠️ | Vali | P0 | `supabase/functions/gmail-sync/index.ts:331-387` | H | BR-005, BR-030 |
| RULE-026 | Live mode requires CRON_SECRET to gate the --no-verify-jwt endpoint | Vali | P0 | `supabase/functions/submission-worker/index.ts:97-118` | H | BR-131 |
| RULE-027 | Monthly budget cap (calendar month, includes in-flight) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:192-208` | H | BR-131, BR-136 |
| RULE-028 | No resubmit once application is submitted | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:210-219` | H | BR-135 |
| RULE-029 | Offer-stage protection: rejection email never auto-overwrites an offer | Vali | P0 | `supabase/functions/gmail-sync/logic.ts:439-444` | H | BR-012 |
| RULE-030 | Pause kill switch halts all submissions for a user | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:164-167` | H | BR-132 |
| RULE-031 | prospector-cron has NO auth gate (publicly invokable, deployed --no-verify-jwt) ⚠️ | Vali | P0 | `supabase/functions/prospector-cron/index.ts:974-1019` | H | BR-100, BR-101 |
| RULE-032 | Submission ownership gate (application AND job belong to the queue row's user) | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:147-161` | H | BR-005, BR-148 |
| RULE-033 | Submission-worker RPCs are service-role only; clients cannot call them | Vali | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:280-281` | H | BR-131, BR-148 |
| RULE-034 | AI cost cap blocks non-critical calls; critical pipeline calls exempt | Vali | P1 | `src/features/applications/services/aiScoringService.ts:62-78` | H | BR-050, BR-052, BR-053 |
| RULE-035 | AI score thresholds drive discovery-stage promotion recommendation | Vali | P1 | `src/features/applications/services/aiScoringService.ts:23-56` | H | BR-020, BR-021, BR-022, BR-142 |
| RULE-036 | Email auto-action confidence gate (>= 0.70) | Vali | P1 | `supabase/functions/gmail-sync/logic.ts:50` | H | BR-030, BR-031 |
| RULE-037 | Email relevance storage gate ('unknown' mail dropped unless matched or labeled) | Vali | P1 | `supabase/functions/gmail-sync/logic.ts:388-394` | H | BR-035 |
| RULE-038 | Missing channel config fails to manual (never blind-fires) | Vali | P1 | `supabase/functions/submission-worker/index.ts:168-186; supabase/functions/_shared/submission/browserAdapter.ts:41-129` | H | BR-146, BR-134 |
| RULE-039 | Prospector dedup by source_url (silent ON CONFLICT DO NOTHING) | Vali | P1 | `supabase/functions/prospector-cron/index.ts:846-873` | H | BR-063, BR-102 |
| RULE-040 | Prospector employment-type chip mapping (uppercase enum) | Vali | P1 | `supabase/functions/prospector-cron/index.ts:254-273` | H | BR-100 |
| RULE-041 | Prospector job dedup by source_url (silent skip) | Vali | P1 | `supabase/functions/prospector-cron/index.ts:850-872` | H | BR-063, BR-102 |
| RULE-042 | Prospector minimum-salary filter (null-safe) | Vali | P1 | `supabase/functions/prospector-cron/index.ts:705-740` | H | BR-105 |
| RULE-043 | user_settings guardrail bounds enforced by DB CHECK constraints | Vali | P1 | `supabase/migrations/20260612000001_create_user_settings.sql:10-28` | H | BR-130, BR-131, BR-136 |
| RULE-044 | CSV ingestion requires source_url and title; enum fields coerced | Vali | P2 | `src/features/applications/services/ingestionCsv.ts:160-186` | H | BR-063 |
| RULE-045 | Self-sent / digest sender exclusion before classification | Vali | P2 | `supabase/functions/gmail-sync/logic.ts:230-239` | H | BR-035 |
| RULE-046 | application_events rows are append-only (never updated or deleted) | Life | P0 | `supabase/migrations/20260603000010_create_application_events.sql:89-129` | H | BR-003 |
| RULE-047 | Atomic stage transition with ownership + optimistic-lock + mandatory event | Life | P0 | `supabase/migrations/20260605000001_transition_stage_rpc.sql:5-37` | H | BR-002, BR-005 |
| RULE-048 | claim_submission: server-side guardrail ladder before a submission fires | Life | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:78-275` | H | BR-130, BR-131, BR-132, BR-135, BR-136, BR-148 |
| RULE-049 | Documents are immutable once linked (is_locked) and versioned per user per type | Life | P0 | `supabase/migrations/20260603000006_create_documents.sql:30-74; supabase/migrations/20260603000009_create_application_materials.sql:28-50; src/features/applications/services/documentStorageService.ts:97-182` | H | BR-007, BR-070, BR-071, BR-072 |
| RULE-050 | Email classification confidence gate for auto-transition (>=0.70) | Life | P0 | `supabase/functions/gmail-sync/logic.ts:50` | H | BR-030, BR-031 |
| RULE-051 | Every stage change must write an immutable application_events row (event sourcing) | Life | P0 | `supabase/migrations/20260605000001_transition_stage_rpc.sql:17-37; supabase/migrations/20260603000008_create_applications.sql:73-121` | H | BR-002, BR-003 |
| RULE-052 | finalize_submission: success vs failure side-effects (only success consumes a credit) | Life | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:306-411` | H | BR-135, BR-136, BR-002 |
| RULE-053 | Pipeline stage transitions are one-directional except ghosted->applied | Life | P0 | `src/features/applications/domain/stageRules.ts:3-17` | H | BR-011, BR-013 |
| RULE-054 | Stuck 'submitting' rows expire to terminal failed (never auto-resubmit) | Life | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:441-509` | H | BR-136, BR-147 |
| RULE-055 | Submission queue state machine: client vs worker-owned statuses | Life | P0 | `supabase/migrations/20260612000004_create_application_queue.sql:18-78; src/features/applications/services/submissionQueueService.ts:41-158` | H | BR-133, BR-148 |
| RULE-056 | Calendar interview detection auto-schedules and transitions to interview_scheduled | Life | P1 | `src/features/applications/services/calendarIntelligenceService.ts:116-156` | H |  |
| RULE-057 | Default stage on application creation is 'discovery' | Life | P1 | `supabase/migrations/20260603000008_create_applications.sql:26-37` | H | BR-010, BR-013 |
| RULE-058 | Gmail ingestion is deduplicated and cursor held back on truncated run | Life | P1 | `supabase/functions/gmail-sync/index.ts:393-456` | H | BR-036 |
| RULE-059 | prospecting_runs status lifecycle (run outcome classification) ⚠️ | Life | P1 | `supabase/migrations/20260607000001_add_prospecting_tables.sql:155-186; supabase/functions/prospector-cron/index.ts:151` | H | BR-106 |
| RULE-060 | Gmail/Calendar auto-transitions are attributed to scraper actors | Life | P2 | `supabase/functions/gmail-sync/index.ts:200-219; src/features/applications/services/calendarIntelligenceService.ts:277-285` | H | BR-002, BR-031 |
| RULE-061 | Interview record status lifecycle | Life | P2 | `supabase/migrations/20260603000012_create_interviews.sql:19-20` | H |  |
| RULE-062 | Anthropic model display-name to API id mapping (silent swap) ⚠️ | Poli | P0 | `supabase/functions/_shared/llm/anthropic.ts:12-18` | H | BR-103, BR-120, BR-140 |
| RULE-063 | application_events are append-only (no UPDATE/DELETE, even by service role) | Poli | P0 | `supabase/migrations/20260603000010_create_application_events.sql:89-129` | H | BR-003 |
| RULE-064 | Approval events are server-trusted only (forge prevention) | Poli | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:570-657; src/features/applications/services/submissionApprovalService.ts:207-235` | H | BR-130, BR-131, BR-005 |
| RULE-065 | Daily submission cap (rolling 24h, incl. in-flight) | Poli | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:174-190; supabase/migrations/20260612000001_create_user_settings.sql:23` | H | BR-131, BR-136 |
| RULE-066 | Live submission worker must have CRON_SECRET (fail closed) ⚠️ | Poli | P0 | `supabase/functions/submission-worker/index.ts:97-118` | H |  |
| RULE-067 | Submission authorization: explicit approval event OR autonomous review_mode + score | Poli | P0 | `supabase/migrations/20260613000004_submission_worker_rpcs.sql:221-249; src/features/applications/services/submissionQueueService.ts:203-224` | H | BR-130, BR-131 |
| RULE-068 | SUBMISSION_LIVE kill-default (zero-side-effect dry-run unless explicitly live) | Poli | P0 | `supabase/functions/submission-worker/index.ts:60-70` | H | BR-146 |
| RULE-069 | Channel resolution: API-first ATS vs browser fallback vs manual | Poli | P1 | `supabase/functions/_shared/submission/resolveChannel.ts:36-91` | H | BR-134 |
| RULE-070 | Email classification is a critical task: never blocked by AI cost cap; usage always logged ⚠️ | Poli | P1 | `supabase/functions/gmail-sync/index.ts:148-198` | H | BR-053, BR-054 |
| RULE-071 | Gmail label is authoritative classification (skips Gemini, confidence 0.95) | Poli | P1 | `supabase/functions/gmail-sync/logic.ts:332-379` | H | BR-035, BR-037 |
| RULE-072 | Gmail send rolling-minute rate guard (10/min) | Poli | P1 | `supabase/functions/gmail-send/index.ts:31` | H | BR-033, BR-038 |
| RULE-073 | Job deduplication by source_url | Poli | P1 | `supabase/functions/prospector-cron/index.ts:846-872` | H | BR-063, BR-102 |
| RULE-074 | Prospector cron frequency, activation, and per-profile isolation | Poli | P1 | `supabase/functions/prospector-cron/index.ts:1011` | M | BR-100, BR-107 |
| RULE-075 | Prospector SerpApi 429 exponential backoff | Poli | P1 | `supabase/functions/prospector-cron/index.ts:173-175` | H | BR-033 |
| RULE-076 | Submission worker finalize retry / stuck-row cutoff | Poli | P1 | `supabase/functions/submission-worker/index.ts:202-253; supabase/migrations/20260613000004_submission_worker_rpcs.sql:441-443` | H | BR-147 |
| RULE-077 | JD formatting bounded per prospector run | Poli | P2 | `supabase/functions/prospector-cron/index.ts:165-171` | H | BR-054 |
| RULE-078 | Prospector JD formatting per-run bound and cost | Poli | P2 | `supabase/functions/prospector-cron/index.ts:163-171` | H | BR-054 |
| RULE-079 | Submission worker batch size and scan window | Poli | P2 | `supabase/functions/submission-worker/index.ts:55-76` | H | BR-130 |
| RULE-080 | Unknown chat-model fallback to general_qa default | Poli | P2 | `src/lib/ai-router.ts:195-254` | H | BR-120, BR-124 |


---

## Calculation rules (18)

### RULE-001: AI monthly cost hard cap and warning ladder
**Category:** Calculation
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `src/lib/ai-router.ts:5-7,101-139`  ·  **BR:** BR-050, BR-051, BR-052, BR-053
**Plain English:** Total AI spend across all providers is capped at $75.00 per calendar month. At $60.00 (80%) and $67.50 (90%) the system raises warnings but keeps working. At/above $75.00 it blocks non-critical AI calls, but critical calls (email classification, stage transitions) are never blocked.
**Specification:**
```gherkin
Given A user whose month-to-date AI spend (sum of ai_model_usage.estimated_cost_usd since the UTC 1st of the month) is $67.80 and a non-critical task (e.g. match_scoring)
When  routeAiTask / evaluateAiCostPolicy is evaluated
Then  status='warn_90', shouldBlock=false (call proceeds). If spend were $75.00+ and the task non-critical, shouldBlock=true (status='capped_non_critical'); if the task is critical, status='capped_critical_override', shouldBlock=false
And   AI cost monitor banner state (aiCostMonitorService.buildBanner) is derived from the same policyStatus
```
**Parameters:** AI_MONTHLY_COST_CAP_USD=$75; AI_WARNING_80_PERCENT_USD=$60 (exactly 80% of 75); AI_WARNING_90_PERCENT_USD=$67.50 (exactly 90% of 75); month window = UTC calendar month start (getUtcMonthStartIso)
**Edge cases handled:**
- Window is UTC calendar-month, not a rolling 30 days or the user's billing period — spend resets at UTC midnight on the 1st (BR-104 references 'next billing period' which may not align with UTC).
- Comparison is >= so spend landing exactly on a threshold trips it.
- shouldBlock only ever applies to non-critical tasks; in ROUTING_MATRIX only email_classification is isCritical=true, so every other task (incl. stage-related ones) is blockable here despite BR-053 naming 'stage transitions' as critical.
**⚠️ Suspected defect:** BR-053 says stage transitions are never blocked, but no task type maps a stage-transition AI call to isCritical=true (only email_classification is critical). If any stage transition relied on a non-critical AI task it could be blocked at the cap, contradicting BR-053.
**Confidence:** High — Constants and branch logic are explicit; warning amounts are the exact 80/90% of the cap and match BR-050/051/052.

### RULE-002: Email classification auto-action confidence threshold (0.70)
**Category:** Calculation
**Priority:** P0
**Source:** `supabase/functions/gmail-sync/logic.ts:50,424-453`  ·  **BR:** BR-030, BR-031
**Plain English:** An email is auto-actioned (stage transition) only when its classification confidence is at least 0.70 AND it matches a tracked application. Below 0.70 the email is stored but no automatic action is taken.
**Specification:**
```gherkin
Given An email classified 'rejection' with confidence 0.68 matched to an application in 'screening'
When  resolveAutoAction evaluates
Then  action='skip' (confidence below 0.70). At confidence 0.70+ and a valid transition it returns action='transition' to the mapped stage
```
**Parameters:** AUTO_ACTION_CONFIDENCE_THRESHOLD=0.70 (strict < blocks; >= permits). Stage mapping: interview_invite→interview_scheduled, rejection→rejected, offer→offer
**Edge cases handled:**
- Offer-stage protection: a 'rejection' on an application already at 'offer' is always skipped regardless of confidence (manual confirm required — BR-012).
- Transition still must be legal per ALLOWED_TRANSITIONS or it is skipped.
**Confidence:** High — Threshold constant and the < comparison are explicit and map directly to BR-030/031.

### RULE-003: Heuristic job-fit scoring weights and targets (fallback)
**Category:** Calculation
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `src/features/applications/services/pipelineService.ts:33-46,98-155`  ·  **BR:** BR-025, BR-141
**Plain English:** When the LLM is blocked by the cost cap or errors, a deterministic score (0-100) is computed: matched keyword counts in each bucket are scaled to a per-bucket max (skills 35, domain 20, seniority 20, tools 15) reaching full weight at a target match count (skills 3, domain 1, seniority 2, tools 2). Location/Auth adds 10 if remote/hybrid/anywhere/US/target-metro matched, else a 5 baseline.
**Specification:**
```gherkin
Given A JD matching 2 skill keywords, 1 domain, 2 seniority, 1 tool, and containing 'remote'
When  scoreJobFit runs (scoreBucket = min(round(matched/target * weight), weight))
Then  skills=min(round(2/3*35),35)=23; domain=min(round(1/1*20),20)=20; seniority=min(round(2/2*20),20)=20; tools=min(round(1/2*15),15)=8; locationAuth=10; overall=23+20+20+8+10=81 (Auto-Submit Prep)
```
**Parameters:** Bucket weights: skills 35, domain 20, seniority 20, tools 15 (sum 90); locationAuth 10 if matched else 5. SCORE_TARGETS: skills 3, domain 1, seniority 2, tools 2. Location matches: 'remote','hybrid','anywhere','united states', regex \b(US|U.S.?|USA|US-based)\b, or target metro (first segment of profile.targetLocation). Calibrated 2026-06 (skills 4→3, domain 2→1, baseline 2→5).
**Edge cases handled:**
- Max attainable overall is 90 (buckets) + 10 (location) = 100; minimum is 0 buckets + 5 baseline = 5 — a totally non-matching job still scores 5, never 0.
- domain target of 1 means a single domain keyword maxes that bucket (20 pts) — easy to clear the 60 line with sparse matches.
- thresholdPassed uses profile.constraints.autoApplyThreshold, not the hardcoded 80 used elsewhere (potential divergence).
**⚠️ Suspected defect:** Heuristic recalibration lowered targets to un-starve the funnel; combined with the 5-pt location baseline and domain target=1, weak JDs can now reach 60+ (Consideration) on thin keyword overlap, inflating the review queue.
**Confidence:** High — All weights, targets and the scoreBucket formula are explicit constants with calibration comments tying to BR-025.

### RULE-004: Match-score recommendation thresholds (60 / 80)
**Category:** Calculation
**Priority:** P0
**Source:** `src/features/applications/services/aiScoringService.ts:23-45`  ·  **BR:** BR-020, BR-021, BR-022, BR-142
**Plain English:** A job's overall match score (0-100) is bucketed: 80+ = Auto-Submit Prep ('apply'); 60-79 = Consideration ('consider'); below 60 = Reject. This single mapping owns the recommendation; the LLM's own recommendation is advisory and never persisted as-is.
**Specification:**
```gherkin
Given An overall_score of 80
When  getScoreLabel / toDbRecommendation run during persistAiScore
Then  label='Consideration', recommendation='consider' (60 <= 72 < 80). A score of 80 maps to 'apply'; 59 maps to 'reject'
And   claim_submission autonomous eligibility compares match_score >= user_settings.auto_submit_score_threshold
```
**Parameters:** Auto-submit threshold = 80 (>=); Consideration threshold = 60 (>=); below 60 = reject. Boundaries inclusive at the lower bound.
**Edge cases handled:**
- auto_submit_score_threshold in user_settings defaults to 80 and is independently configurable (0-100); the hardcoded 80 here for the *label* can diverge from the server-side submission threshold if a user lowers/raises their setting.
- Score is stored as integer 0-100 (Edge clamps via Math.round 0..100).
- These client-side scoring thresholds (60/80 for promotion) are conceptually distinct from the server-side auto_submit_score_threshold used by claim_submission, though both default to 80
**Confidence:** High — Literal thresholds and comparisons; comments explicitly bind to BR-020/021/022 and state no threshold literals live elsewhere.

### RULE-005: Monthly submission budget cap (1 credit = $1, calendar month)
**Category:** Calculation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:192-208; supabase/migrations/20260612000001_create_user_settings.sql:15`  ·  **BR:** BR-131, BR-136
**Plain English:** Submissions in the current calendar month are capped at monthly_budget_usd, treating each submission as $1 (1 credit = 1 submission = $1). Submitted plus in-flight rows since the 1st are counted.
**Specification:**
```gherkin
Given A user with monthly_budget_usd=240 who already has 240 submissions (submitted + submitting) since the month start
When  claim_submission is called
Then  count=240 >= 240 → {ok:false, reason:'monthly_budget_exhausted'}; row stays 'approved' to fire after the month rolls over
```
**Parameters:** monthly_budget_usd default 240, CHECK BETWEEN 20 AND 5000 (matches BudgetModal $20-$5,000); window = date_trunc('month', now()) (calendar month); equivalence: 1 submission = 1 credit = $1
**Edge cases handled:**
- Budget is counted by submission *count* (rows), not by summing actual dollar amounts — the $1/submission assumption is hardcoded.
- Calendar-month window resets at month start, unlike the rolling daily cap.
**Confidence:** High — Explicit SQL with documented '$1 per submission' equivalence and CHECK bounds.

### RULE-006: Submission credit charge / refund accounting
**Category:** Calculation
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:251-264,386-409,441-509`  ·  **BR:** BR-136, BR-147
**Plain English:** One credit is deducted atomically when a submission is claimed. It is refunded if the submission fails or if a 'submitting' row gets stuck past 30 minutes, so only a confirmed successful submission ultimately consumes a credit.
**Specification:**
```gherkin
Given A user with credits=5 whose submission is claimed (credits→4) and then fails to send
When  claim_submission then finalize_submission(p_success=false)
Then  Claim sets credits=4; failure finalize refunds +1 → credits=5. A success finalize keeps credits=4. A stuck row expired by expire_stuck_submitting refunds exactly the per-user count of stuck rows.
```
**Parameters:** Charge = -1 credit at claim; refund = +1 on failure; no_credits guard = credits < 1 (need >= 1 to claim); credits default 141, CHECK >= 0; stuck-expiry cutoff default 30 minutes; expired stuck rows move to TERMINAL 'failed' (never re-queued)
**Edge cases handled:**
- A stuck row may have actually submitted externally; it is moved to 'failed' (not re-tried) and the credit is refunded, so a genuinely-successful-but-unconfirmed submission both refunds a credit AND is never marked submitted — requires manual reconciliation (flagged by outcome='unconfirmed' event).
- credits default of 141 is an arbitrary seeded figure (mirrors JOBS_SEED) and likely needs to become real config.
**⚠️ Suspected defect:** Stuck-expiry refunds a credit and marks the row 'failed' even though the application may have submitted externally; this can under-count consumed budget and leaves a real submission untracked until manual reconciliation.
**Confidence:** High — All credit arithmetic, the refund-on-failure path, and the per-user aggregated refund are explicit in SQL.

### RULE-007: Applications-submitted dashboard count derivation
**Category:** Calculation
**Priority:** P1
**Source:** `src/features/applications/services/submittedCount.ts:52-81; src/features/applications/services/applicationService.ts:35-57`  ·  **BR:** BR-145, BR-135
**Plain English:** An application counts as 'submitted' if (1) submitted_at is set, OR (2) it sits in a post-discovery happy-path stage (applied..hired), OR (3) it is in an ambiguous terminal stage (rejected/ghosted) AND the event log proves a stage_transition into 'applied'. A discovery-stage or discovery-dismissed application does not count.
**Specification:**
```gherkin
Given An application in 'rejected' with submitted_at=null but a prior stage_transition into 'applied' in application_events
When  deriveSubmittedCount runs with the everSubmittedIds set
Then  Counts as submitted (proven via event log). A 'rejected' app with no submitted_at and no applied-event is a discovery dismissal and does NOT count.
```
**Parameters:** submitted = submitted_at != null OR stage IN post-discovery happy path {applied, screening, interview_scheduled, interview_complete, offer, hired} OR (stage IN {rejected, ghosted} AND id in everSubmittedIds); never derived from client/localStorage; demo mode shows a stable seed
**Edge cases handled:**
- discovery → applied submission does NOT stamp submitted_at on the app in the live path (only the queue/finalize does), so terminal-stage apps depend on the event log to be counted correctly.
- Without the everSubmittedIds set, ambiguous terminals are conservatively uncounted (undercount risk).
**Confidence:** High — Three-signal priority and the ambiguous-terminal event resolution are explicit with a dedicated test suite.

### RULE-008: Each submission charges/refunds exactly one credit; credits & monthly budget bounded
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/migrations/20260612000001_create_user_settings.sql:13-23; supabase/migrations/20260613000004_submission_worker_rpcs.sql:251-257,386-392`  ·  **BR:** BR-136
**Plain English:** A submission credit is charged atomically at claim time (credits - 1) and refunded on failure or stuck-expiry (credits + 1), so only a confirmed successful submission ultimately consumes a credit. Credits cannot go below 0 (DB CHECK). The monthly budget is enforced as a per-month submission count where each submission equals 1 credit equals $1.
**Specification:**
```gherkin
Given A user with credits=1 whose single approved row fails at the adapter
When  claim_submission then finalize_submission(success=false) run
Then  Net credits return to 1 (charged at claim, refunded at finalize); a successful submission would have left credits at 0
```
**Parameters:** credits NOT NULL DEFAULT 141 CHECK >= 0; monthly_budget_usd DEFAULT 240 CHECK BETWEEN 20 AND 5000; daily_submission_cap DEFAULT 10 CHECK BETWEEN 1 AND 50; 'each submission = 1 credit = $1' (RPC comment); zero credits or exhausted budget halts queueing/submission
**Edge cases handled:**
- Monthly budget check counts submitted+in-flight rows this calendar month against monthly_budget_usd as if 1 row = $1 — assumes uniform $1 cost per submission
- Credits default (141) and budget default (240) are seeded to mirror the redesigned UI state, not a derived business figure
**Confidence:** High — Charge/refund SQL and CHECK bounds are explicit; the $1-per-credit equivalence is stated in the RPC comment.

### RULE-009: Email-to-application matching heuristic score
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:241-316`  ·  **BR:** BR-035, BR-036
**Plain English:** An incoming email is matched to a tracked application by: (1) sender domain == company domain (strong; ties broken by job-title word overlap), or (2) company-name token in subject/sender PLUS a job-title token in subject/snippet (score >= 2). Unmatched emails are stored with NULL application_id for manual review.
**Specification:**
```gherkin
Given An email from 'recruiter@acme.com' to an application whose company domain is 'acme.com'
When  matchApplication runs
Then  Single domain match → matched (reason 'sender domain acme.com'). With multiple same-domain apps, the one with the most job-title word overlap wins. Company-name path requires score = 1 + titleOverlap >= 2.
```
**Parameters:** Name tokens >= 3 chars, excluding stopwords {inc,llc,ltd,corp,the,co,group,team}; company-name path threshold score >= 2 (i.e. needs >= 1 title-token overlap on top of the name hit); domain normalized (lowercased, strip www., strip leading 'Name <...>')
**Edge cases handled:**
- Self-sent digest senders (gemini-noreply@google.com, and the user's own address) are excluded before matching to avoid a digest quoting real job mail fooling the classifier.
- Company-name-only hit (no title overlap) scores 1 and is rejected (needs >= 2).
**Confidence:** High — Token rules, stopwords, and score thresholds are explicit.

### RULE-010: Gmail keyword fallback confidence formula
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:119-150`  ·  **BR:** BR-030
**Plain English:** When the LLM is unavailable, emails are classified by keyword matching. Confidence rises 0.12 per matched keyword starting at a 0.58 base, clamped to [0.58, 0.97]. Zero keyword matches = 'unknown' at 0.50 (which gates out of auto-action and out of storage).
**Specification:**
```gherkin
Given An email whose text contains 2 'interview_invite' keywords (e.g. 'interview' and 'schedule')
When  classifyByKeywords runs
Then  confidence = clamp(0.58 + 2*0.12, 0.58, 0.97) = 0.82 (>= 0.70, so eligible for auto-action), classification='interview_invite', rounded to 3 dp
```
**Parameters:** base 0.58, per-keyword increment 0.12, clamp min 0.58 max 0.97; zero-match fallback classification='unknown' confidence 0.50; rounded to 3 decimals
**Edge cases handled:**
- A single keyword match yields 0.70 exactly (0.58+0.12) — exactly on the auto-action threshold, so one keyword is enough to auto-transition.
- Ported behavior deliberately deviates from the client version (was 'follow_up' @ 0.55 for zero matches); now 'unknown' @ 0.50, which prevents storage of unmatched mail.
- Best rule chosen by max match count; ties keep the first-declared (offer > rejection > interview_invite > outreach > follow_up ordering).
**Confidence:** High — Formula, constants, clamp and rounding are explicit.

### RULE-011: Gmail mapped-label authoritative confidence (0.95)
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:333-379`  ·  **BR:** BR-037
**Plain English:** If a Gmail message carries a label the user mapped in gmail_label_map, that mapping sets the classification at fixed confidence 0.95 and the LLM call is skipped. With multiple mapped labels, the most consequential classification wins.
**Specification:**
```gherkin
Given A message carrying a Gmail label mapped to 'offer' and another mapped to 'follow_up'
When  resolveLabelClassification runs (case-insensitive label match)
Then  classification='offer' (highest priority) at confidence 0.95, source='gmail_label'; Gemini is not called
```
**Parameters:** GMAIL_LABEL_CONFIDENCE=0.95; CLASSIFICATION_PRIORITY order: offer > rejection > interview_invite > outreach > follow_up > unknown
**Edge cases handled:**
- 0.95 > 0.70 so a mapped label always clears the auto-action gate (subject to legal-transition and offer-protection checks).
**Confidence:** High — Constant and priority array explicit; well above 0.70 so mapped labels always auto-action when matched.

### RULE-012: Per-model token pricing for AI cost logging
**Category:** Calculation
**Priority:** P1
**Source:** `src/lib/ai-router.ts:264-283`  ·  **BR:** BR-054, BR-121
**Plain English:** Estimated cost of every AI call is computed from a per-model input/output price per token. Any model not in the table falls back to Sonnet-equivalent pricing ($3/$15 per million) so nothing logs as $0.
**Specification:**
```gherkin
Given A match_scoring call to 'Claude Opus 4.6' using 12,000 input tokens and 800 output tokens
When  estimatedCostUsd = tokensIn*inputUsdPerToken + tokensOut*outputUsdPerToken (rounded to 6 dp)
Then  12000*(15/1e6) + 800*(75/1e6) = $0.18 + $0.06 = $0.240000
```
**Parameters:** Per 1M tokens (input/output): Sonnet 4.6 $3/$15; Opus 4.6 $15/$75; GPT-5 $5/$15; GPT-4o $2.5/$10; Gemini 2.5 Pro $1.25/$5; Gemini 2.5 Flash $0.30/$2.50; Claude 3.5 Haiku $0.80/$4. FALLBACK_PRICING=$3/$15 per 1M
**Edge cases handled:**
- Fallback pricing silently applies to any new/renamed model, so a mispriced model under-reports rather than erroring.
- Gemini 2.5 Flash rates are duplicated server-side in gmail-sync/logic.ts (must stay in sync); Haiku rates duplicated in prospector-cron.
**Confidence:** High — Rates and the multiply-add formula are explicit; rounding to 6 dp confirmed in aiScoringService.scoreJobFitWithLlm (line 289-291).

### RULE-013: Prospector salary parsing (K/M suffix expansion)
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:88-120`  ·  **BR:** BR-105
**Plain English:** SerpApi salary strings are parsed into integer min/max for storage. 'K' multiplies by 1,000, 'M' by 1,000,000; currency symbols and commas are stripped; ranges use any unicode dash; a single value sets min=max. Unparseable strings yield null/null.
**Specification:**
```gherkin
Given The salary string '1.5M–2M a year'
When  parseSalary runs
Then  { min: 1500000, max: 2000000 }. '73K–97K a year' → {73000, 97000}; '$100,000 a year' → {100000, 100000}; 'competitive' → {null, null}
```
**Parameters:** K multiplier 1,000; M multiplier 1,000,000; values rounded via Math.round; dashes handled: hyphen-minus, en dash U+2013, em dash U+2014; only leading numeric token parsed
**Edge cases handled:**
- Only the first matched numeric token per side is used; 'up to 97K' style phrasing without a leading number returns null.
- Hourly/weekly salaries are not normalized to annual — e.g. '$50 an hour' parses as min=max=50, not annualized.
**Confidence:** High — Regexes, multipliers and rounding are explicit with documented examples.

### RULE-014: Server-side LLM job-fit score clamping (0-100 integers)
**Category:** Calculation
**Priority:** P1
**Source:** `supabase/functions/score-job-fit/index.ts:120-124,154-186`  ·  **BR:** BR-140
**Plain English:** Every sub-score and the overall score returned by the LLM is forced to an integer between 0 and 100. overall_score is the model's holistic judgement, NOT a weighted sum of sub-scores.
**Specification:**
```gherkin
Given An LLM that returns overall_score: 103.7 and skills_score: -4
When  clampInt(value) = Math.max(0, Math.min(100, Math.round(n)))
Then  overall_score=100, skills_score=0. Any non-finite value makes the whole score null and the function returns an 'unknown' error (caller falls back to heuristic)
```
**Parameters:** Lower bound 0, upper bound 100, rounding = Math.round (half-up for positives). overall_score is explicitly 'not a fixed formula' per the system prompt.
**Edge cases handled:**
- overall_score can be internally inconsistent with sub-scores since it is independent.
- A single unparseable/non-finite sub-score nullifies the entire score, triggering heuristic_fallback.
**Confidence:** High — clampInt and validation are explicit; prompt states overall is holistic not derived.

### RULE-015: Compensation display formatting (K abbreviation)
**Category:** Calculation
**Priority:** P2
**Source:** `src/features/jobs/components/prospectorJobFields.ts:17-24; src/features/auto-apply/services/autoApplyService.ts:44-50`
**Plain English:** Salary integers are rendered as compact '$73K–$97K' labels: values >= 1000 are divided by 1000 and rounded to whole K; min==max collapses to a single value; only one side present renders '$X+' or 'Up to $X'.
**Specification:**
```gherkin
Given compensation_min=73000, compensation_max=97000
When  formatCompensation runs
Then  '$73K–$97K'. min only (73000,null) → '$73K+'; max only (null,97000) → 'Up to $97K'; both null → null
```
**Parameters:** K threshold = 1000; rounding = Math.round(n/1000); separator = en dash '–'; suffix '+' for min-only, 'Up to' prefix for max-only. (autoApplyService variant uses lowercase 'k')
**Edge cases handled:**
- Values 1000-1499 round to '$1K' losing precision; values < 1000 render as raw dollars (likely hourly figures from salary parser, mislabeled as comp).
- Two near-identical formatters exist (prospectorJobFields uppercase K + en dash; autoApplyService lowercase k) — display drift risk.
**Confidence:** High — Pure formatting functions with explicit thresholds.

### RULE-016: Prospector relative posted-date parsing
**Category:** Calculation
**Priority:** P2
**Source:** `supabase/functions/prospector-cron/index.ts:668-693`
**Plain English:** SerpApi 'posted_at' strings like '2 days ago' are converted to an absolute ISO timestamp by subtracting the stated duration from now. Only hours/days/weeks patterns are recognized; anything else yields null.
**Specification:**
```gherkin
Given posted_at='2 days ago' evaluated at 2026-06-15T12:00:00Z
When  parsePostedAt runs
Then  now - 2*86,400,000ms = 2026-06-13T12:00:00Z (ISO)
```
**Parameters:** hour=3,600,000ms; day=86,400,000ms; week=7*86,400,000ms; patterns matched at string start only; months/'30+ days ago' not parsed (→ null)
**Edge cases handled:**
- '30+ days ago', 'today', 'just posted', and month-based strings return null (no posted_at stored).
**Confidence:** High — Regexes and millisecond constants are explicit.

### RULE-017: Relative-time display thresholds
**Category:** Calculation
**Priority:** P2
**Source:** `src/features/jobs/components/prospectorJobFields.ts:27-41; src/features/auto-apply/services/autoApplyService.ts:23-36`
**Plain English:** Timestamps are rendered as human relative labels using fixed day/hour buckets (Today, Yesterday, N days ago, 1 week ago, N weeks ago, 1 month ago, N months ago).
**Specification:**
```gherkin
Given A posted_at 10 days before now
When  formatRelativeDate runs
Then  diffDays=10 → between 7 and 14 → '1 week ago'. 0→'Today', 1→'Yesterday', <7→'N days ago', 14-29→'N weeks ago' (floor diffDays/7), 30-59→'1 month ago', else 'N months ago' (floor diffDays/30)
```
**Parameters:** Buckets in days: 0 Today; 1 Yesterday; <7 'days ago'; <14 '1 week'; <30 weeks (floor/7); <60 '1 month'; else months (floor/30). autoApplyService variant adds minute/hour granularity (<2min 'Just now', <60min minutes, <24h hours)
**Edge cases handled:**
- Month math uses 30-day approximation, so '2 months ago' can be off by days.
- Two divergent implementations (one day-granular, one minute-granular) — inconsistent labels across screens.
**Confidence:** High — Bucket boundaries are explicit literals.

### RULE-018: Submitted-count derivation from applications truth (not localStorage)
**Category:** Calculation
**Priority:** P2
**Source:** `src/features/applications/services/submittedCount.ts:30-81; src/features/applications/services/applicationService.ts:40-78`  ·  **BR:** BR-145, BR-133
**Plain English:** The dashboard 'Applications Submitted' figure is derived from DB truth: an application counts as submitted if submitted_at is set, OR it sits in a post-discovery happy-path stage (applied..hired, whose only entry path runs through applied), OR it is in an ambiguous terminal stage (rejected/ghosted) AND the event log shows a stage_transition INTO 'applied'. A discovery->rejected dismissal that was never submitted does NOT count.
**Specification:**
```gherkin
Given An application in stage 'rejected' with submitted_at=null but a prior stage_transition event into 'applied'
When  deriveSubmittedCount runs with that id in everSubmittedIds
Then  It counts as submitted; an application in 'rejected' that went discovery->rejected (no applied event) does not count
```
**Parameters:** SUBMITTED_STAGES = {applied, screening, interview_scheduled, interview_complete, offer, hired}; AMBIGUOUS_TERMINAL_STAGES = {rejected, ghosted}; ambiguous terminals resolved via application_events stage_transition to_stage='applied'
**Confidence:** High — Three-signal logic and stage sets are explicit; relies on the stageRules invariant that applied is the only entry to post-discovery stages.


---

## Validation rules (27)

### RULE-019: Approval event requires a linked resume (submission packet prepared)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:599-651`  ·  **BR:** BR-130, BR-131
**Plain English:** An approval event can only be written for an application the caller owns AND that already has a resume linked via application_materials. This prevents forging an approval on a bare application that never went through the document-preparation/approvePreparedPacket flow. Direct client inserts of approval events are blocked by RLS; this RPC is the only path.
**Specification:**
```gherkin
Given An authenticated user calls write_approval_event for an application they own that has no application_materials row of material_type='resume'
When  write_approval_event(p_application_id) executes
Then  It raises an exception ('no linked resume document found') and writes no approval event. With a linked resume it inserts one approval event with actor='jb_manual'
```
**Parameters:** event_type='approval'; actor='jb_manual'; required material_type='resume'; RLS clause event_type <> 'approval' on App events INSERT policy
**Edge cases handled:**
- auth.uid() NULL raises 'caller is not authenticated'
- Application not owned by caller raises 'application not found or not owned'
- Function is granted to authenticated (not just service_role) so the client approval flow still works
**Confidence:** High — Ownership and materials checks are explicit RAISE EXCEPTION guards in the RPC; the RLS tightening is in the same migration.

### RULE-020: Autonomous submission eligibility (review mode + score, server-authoritative)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:221-249`  ·  **BR:** BR-130, BR-131, BR-148
**Plain English:** A queued submission is authorized to fire only if either (a) an explicit human approval event exists for the application, OR (b) the user's review_mode is 'assist' or 'auto' AND the application's server-side match_score is at least their auto_submit_score_threshold. Client-supplied queued_by is never an authorization input.
**Specification:**
```gherkin
Given review_mode='assist', auto_submit_score_threshold=80, an application with match_score=82 and no approval event
When  claim_submission evaluates authorization
Then  v_autonomous_ok is true (85 >= 80), the row is authorized, one credit is charged, and the row flips to 'submitting'. If match_score were 72 with no approval event, claim returns {ok:false, reason:'awaiting_approval'} and the row stays 'approved'
```
**Parameters:** review_mode default 'review' (CHECK in review/assist/auto); auto_submit_score_threshold default 80 (CHECK 0-100); autonomous requires review_mode IN ('assist','auto') AND match_score IS NOT NULL AND match_score >= threshold; explicit approval (event_type='approval') authorizes ANY mode
**Edge cases handled:**
- review_mode='review' can ONLY submit via an explicit approval event — score alone never authorizes it.
- Null match_score blocks autonomous submission entirely (awaiting_approval).
- A below-threshold row is never cancelled; it sits in 'approved' indefinitely awaiting an approval event.
- review_mode='review' never auto-authorizes; requires an explicit approval event regardless of score
- match_score IS NULL fails the autonomous path (no submission)
- Forging an approval event directly is blocked: App events INSERT policy now rejects event_type='approval'; only write_approval_event RPC can write it
**Confidence:** High — Boolean logic and comparisons are explicit SQL; comments bind to BR-130/131/148.

### RULE-021: Candidate completeness gate before any real ATS send
**Category:** Validation
**Priority:** P0
**Source:** `supabase/functions/_shared/submission/atsAdapters.ts:50-59, 233-275`  ·  **BR:** BR-134
**Plain English:** No ATS adapter blind-fires or fabricates candidate data. A real send proceeds only when required candidate fields are present (email, phone, name, resume PDF) AND the board identifiers resolve AND a resume file is attached. Otherwise it returns a structured channel_not_configured failure carrying the missing[] list — never a silent or faked submit. Ashby is preview-only (resume upload is a v1 limitation), so it always returns not_configured.
**Specification:**
```gherkin
Given A Greenhouse posting where the candidate profile has no phone and no resume PDF
When  greenhouseAdapter builds and guards the request
Then  missing=['phone','resume_pdf'] -> returns {success:false, channel:'ats', error:'channel_not_configured', metadata:{missing}}; no POST. With all fields present it POSTs multipart to the Greenhouse Job Board API
```
**Parameters:** Required: email, phone, (firstName or fullName), resume; board ids from URL path; Greenhouse/Lever sendable, Ashby always not_configured (ashby_resume_upload_v1_limitation)
**Edge cases handled:**
- An unseeded/empty candidate profile resolves but fails the missing[] check, so it fails safe and never sends
- candidate.resume null (storage download failed) blocks the send even if profile fields are present
**Confidence:** High — candidateMissing and the per-adapter guard conditions are explicit; matches the BR-134 hard rule.

### RULE-022: Credit balance gate (>= 1 credit required to submit)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:169-171, 251-257`  ·  **BR:** BR-136
**Plain English:** A submission requires at least 1 credit. One credit is charged atomically at claim and refunded on failure or stuck-expiry, so only a confirmed successful submission ultimately consumes a credit. Zero credits leaves the row 'approved' until replenished.
**Specification:**
```gherkin
Given A user with user_settings.credits=0 and an approved queue row
When  claim_submission runs
Then  Returns {ok:false, reason:'no_credits'}; row stays 'approved'. With credits>=1 the claim decrements credits by 1 and flips the row to 'submitting'
```
**Parameters:** credits integer default 141, CHECK (credits >= 0); charge = -1 at claim; refund = +1 on finalize failure / expire_stuck_submitting
**Edge cases handled:**
- Claims are processed sequentially per BR-136 so credit accounting is never raced
- expire_stuck_submitting refunds per user by exact stuck-row count, not a flat +1
**Confidence:** High — Charge, refund, and gate are explicit in claim_submission, finalize_submission, and expire_stuck_submitting; matches BR-136/147.

### RULE-023: Daily submission cap (rolling 24h, includes in-flight)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:174-190`  ·  **BR:** BR-131, BR-136
**Plain English:** A user may not exceed their daily_submission_cap submissions in any rolling 24-hour window. The count includes both confirmed 'submitted' rows and in-flight 'submitting' claims, closing the overlapping-run race. Over the cap leaves the row 'approved' until the window rolls.
**Specification:**
```gherkin
Given A user with daily_submission_cap=10 who already has 10 submitted+in-flight rows in the last 24h
When  claim_submission counts q.status submitted/submitting within now()-24h
Then  v_submitted_24h (10) >= v_daily_cap (10) -> returns {ok:false, reason:'daily_cap'}; row stays 'approved'
```
**Parameters:** daily_submission_cap integer default 10, CHECK BETWEEN 1 AND 50; window = interval '24 hours'
**Edge cases handled:**
- Per-user advisory xact lock (pg_advisory_xact_lock) serializes concurrent claims so two overlapping runs cannot both pass the cap
**Confidence:** High — Explicit count query and >= comparison with documented reason code; in-flight inclusion is commented (FIX 3).

### RULE-024: gmail-send is JWT-verified, user-scoped, never autonomous
**Category:** Validation
**Priority:** P0
**Source:** `supabase/functions/gmail-send/index.ts:215-309`  ·  **BR:** BR-038
**Plain English:** Email sending requires a valid Supabase JWT (getAuthenticatedUserId) and is an explicit user action only — this function never sends a draft autonomously. Every email lookup is scoped to the caller's user_id. AI drafts (mode='draft') are returned for human review and never sent. Send modes validate required fields before sending.
**Specification:**
```gherkin
Given An unauthenticated POST to gmail-send, or a 'compose' POST missing 'to'
When  The handler runs
Then  No JWT -> 401 Unauthorized. compose without 'to' -> 400 'to required for compose'; without 'subject' -> 400; empty body -> 400. A 'draft' request returns the draft text and sends nothing
```
**Parameters:** getAuthenticatedUserId via forwarded JWT; modes reply/forward/compose/draft; emails scoped by .eq('user_id', userId); draft uses Gemini 2.5 Flash, logged as task_type 'email_draft'
**Edge cases handled:**
- Draft generation does NOT enforce the 0.70 gate or send — it is advisory output only
- Gmail not configured -> 503 (send paths) but draft still works if Gemini key present
**Confidence:** High — JWT check, per-field validation, and draft-only-no-send paths are explicit; matches BR-038.

### RULE-025: gmail-sync has NO auth gate; only a 60-second re-invocation time guard
**Category:** Validation
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `supabase/functions/gmail-sync/index.ts:331-387`  ·  **BR:** BR-005, BR-030
**Plain English:** The gmail-sync Edge Function is deployed for unauthenticated pg_cron invocation and performs NO JWT or CRON_SECRET check. Its only throttle is a soft guard that no-ops if the last run finished under 60 seconds ago. Any caller who can reach the URL can trigger a Gmail read + Gemini classification run.
**Specification:**
```gherkin
Given An anonymous HTTP request to the deployed gmail-sync URL more than 60 seconds after the last run
When  The handler runs
Then  It refreshes the Gmail access token and performs a full sync/classify/transition run with the service role — no auth check rejects the request
```
**Parameters:** MIN_SECONDS_BETWEEN_RUNS=60 (re-invocation guard, not auth); GMAIL_REFRESH_TOKEN / GOOGLE_OAUTH_CLIENT_SECRET (credentials, masked — see supabase/functions/gmail-sync/index.ts:336); SUPABASE_SERVICE_ROLE_KEY
**Edge cases handled:**
- The time guard relies on gmail_sync_state.last_synced_at; if that write fails the guard can be bypassed
- Auto-transitions still flow through the 0.70 confidence gate, but storage and classification cost still occur
**⚠️ Suspected defect:** Deployed --no-verify-jwt with no auth gate. The 60s guard limits frequency but not access; an attacker can spend Gemini quota and drive autonomous stage transitions. Should adopt the CRON_SECRET pattern.
**Confidence:** High — No auth gate exists in the handler; the only guard is a time-based no-op. Confirmed by reading the full handler.
**SME question:** Should gmail-sync require a CRON_SECRET (matching submission-worker) before deployment, given it is currently publicly invokable?

### RULE-026: Live mode requires CRON_SECRET to gate the --no-verify-jwt endpoint
**Category:** Validation
**Priority:** P0
**Source:** `supabase/functions/submission-worker/index.ts:97-118, 518-536`  ·  **BR:** BR-131
**Plain English:** The submission worker is deployed --no-verify-jwt so pg_cron can invoke it. When CRON_SECRET is set, every request must carry it (x-cron-secret header or Authorization: Bearer) via a constant-time compare, else 401. If CRON_SECRET is unset the endpoint is open in dry-run/shadow only; in live mode an unset CRON_SECRET fails closed with a 503 and the worker refuses to run.
**Specification:**
```gherkin
Given SUBMISSION_LIVE='true' and CRON_SECRET is unset
When  A request hits the handler
Then  Returns 503 ('live mode requires CRON_SECRET') and runs nothing. With CRON_SECRET set, a request lacking the matching secret returns 401
```
**Parameters:** CRON_SECRET (credential, masked — see supabase/functions/submission-worker/index.ts:108); compared via SHA-256 + branchless XOR timingSafeEqual; headers x-cron-secret or Authorization: Bearer
**Edge cases handled:**
- Unset CRON_SECRET is intentionally tolerated in dry-run/shadow because no external submission can occur in those modes
**Confidence:** High — Fail-closed logic and constant-time compare are explicit; this is the correct auth pattern the other two cron functions lack.

### RULE-027: Monthly budget cap (calendar month, includes in-flight)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:192-208`  ·  **BR:** BR-131, BR-136
**Plain English:** A user may not exceed monthly_budget_usd submissions in the current calendar month (each submission = 1 credit = $1). The count includes submitted and in-flight 'submitting' rows. Over budget leaves the row 'approved' until the month rolls over.
**Specification:**
```gherkin
Given A user with monthly_budget_usd=240 who has 240 submitted+in-flight rows since date_trunc('month', now())
When  claim_submission counts monthly submissions
Then  v_submitted_month (240) >= v_monthly_budget (240) -> returns {ok:false, reason:'monthly_budget_exhausted'}; row stays 'approved'
```
**Parameters:** monthly_budget_usd integer default 240, CHECK BETWEEN 20 AND 5000; 1 submission = 1 credit = $1; window = date_trunc('month', now())
**Edge cases handled:**
- The $1-per-submission equivalence is an implicit modeling assumption (credit cost vs. actual provider cost may diverge)
**Confidence:** High — Explicit count + comparison with reason code (FIX 8); $1-per-submission equivalence stated in comment.

### RULE-028: No resubmit once application is submitted
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:210-219`  ·  **BR:** BR-135
**Plain English:** If an application already has submitted_at set, its queue row is terminal: the claim cancels the row rather than submitting again. jobs.source_url is UNIQUE so same-source duplicates are also covered.
**Specification:**
```gherkin
Given An approved queue row whose application already has submitted_at set
When  claim_submission runs
Then  Sets queue.status='cancelled', last_error='already_submitted', returns {ok:false, reason:'already_submitted'}; no credit charged
```
**Parameters:** Trigger: applications.submitted_at IS NOT NULL; jobs.source_url UNIQUE
**Edge cases handled:**
- This is the only guard that cancels (terminal) rather than leaving 'approved'
**Confidence:** High — Explicit UPDATE to cancelled with reason code; matches BR-135.

### RULE-029: Offer-stage protection: rejection email never auto-overwrites an offer
**Category:** Validation
**Priority:** P0
**Source:** `supabase/functions/gmail-sync/logic.ts:439-444`  ·  **BR:** BR-012
**Plain English:** A rejection-classified email is not allowed to auto-transition an application that is currently in the 'offer' stage. This requires manual confirmation, protecting a real offer from being overwritten by a stray rejection email.
**Specification:**
```gherkin
Given An email classified 'rejection' at confidence 0.90 matched to an application in stage 'offer'
When  resolveAutoAction evaluates
Then  Returns {action:'skip', reason:'Offer-stage protection applied; rejection requires manual confirmation.'} — no transition
```
**Parameters:** Condition: classification==='rejection' AND matched.stage==='offer'
**Edge cases handled:**
- Note: offer->rejected IS a legal transition in ALLOWED_TRANSITIONS, so this dedicated guard (not the transition table) is what blocks the auto-action
- offer->rejected IS a legal transition in canTransitionStage, so this guard is a deliberate ADDITIONAL block layered on top of the stage map, specifically for the autonomous path
- Manual JB-initiated offer->rejected via transition_stage is still permitted
**Confidence:** High — Explicit conditional skip; matches BR-012 directly.

### RULE-030: Pause kill switch halts all submissions for a user
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:164-167`  ·  **BR:** BR-132
**Plain English:** If user_settings.paused is true, the worker submits nothing for that user. The claim returns 'paused' and the row is left 'approved' so it resumes once unpaused.
**Specification:**
```gherkin
Given An approved queue row for a user with user_settings.paused=true
When  claim_submission runs
Then  Returns {ok:false, reason:'paused'}; no credit charged; row stays 'approved' (transient)
```
**Parameters:** paused boolean default false
**Edge cases handled:**
- paused is re-read server-side from user_settings each claim; client state is never trusted
**Confidence:** High — Single explicit guard checked before credit/cap checks; matches BR-132.

### RULE-031: prospector-cron has NO auth gate (publicly invokable, deployed --no-verify-jwt)
**Category:** Validation
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `supabase/functions/prospector-cron/index.ts:974-1019`  ·  **BR:** BR-100, BR-101
**Plain English:** The prospector-cron Edge Function is deployed --no-verify-jwt and performs NO JWT check and NO CRON_SECRET check before reading SERPAPI_KEY and processing all active users' profiles with the service role. Unlike submission-worker, it has no isCronAuthorized gate. Anyone who can reach the URL can trigger paid SerpApi + Anthropic Haiku usage across all users.
**Specification:**
```gherkin
Given An anonymous HTTP POST to the deployed prospector-cron URL
When  The handler runs (after the OPTIONS short-circuit)
Then  It proceeds straight to reading SERPAPI_KEY and service-role processing of every active profile — no 401/403 is ever returned for missing auth
```
**Parameters:** No CRON_SECRET / JWT check present; SERPAPI_KEY (credential, masked — see supabase/functions/prospector-cron/index.ts:985); SUPABASE_SERVICE_ROLE_KEY
**Edge cases handled:**
- BR-100 (max 2 runs/24h) is enforced only by the cron schedule, not in code — a direct caller can invoke it arbitrarily often
- Per-profile error isolation limits blast radius but not abuse
**⚠️ Suspected defect:** Deployed --no-verify-jwt with no auth gate — a public, unauthenticated endpoint that burns paid SerpApi/Anthropic quota and runs service-role processing for all users. Should reuse submission-worker's isCronAuthorized()/CRON_SECRET pattern.
**Confidence:** High — Absence of any auth check between OPTIONS and key access is verifiable in the handler; corroborated by analysis/ASSESSMENT.md flagging CWE-306.
**SME question:** Is prospector-cron intended to be reachable only via pg_cron on a private network, or should it require a CRON_SECRET like submission-worker before any public deployment?

### RULE-032: Submission ownership gate (application AND job belong to the queue row's user)
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:147-161`  ·  **BR:** BR-005, BR-148
**Plain English:** At claim time the worker requires that both the application and its job belong to the same user_id as the queue row. A mismatch (or missing row) returns 'not_owned' with no submission and no credit charge. RLS also requires the inserted application_id to belong to auth.uid() as defense-in-depth.
**Specification:**
```gherkin
Given A queue row with user_id=U whose application_id references an application owned by a different user, or whose job's user_id differs from U
When  claim_submission runs the ownership SELECT joining applications a to jobs j ON j.user_id = v_user_id
Then  NOT FOUND -> returns {ok:false, reason:'not_owned'}; no credit charged, no submit. The RLS INSERT policy on application_queue also rejects inserting a foreign application_id
```
**Parameters:** Join condition: a.user_id=v_user_id AND j.user_id=v_user_id AND j.id=a.job_id; RLS WITH CHECK requires application_id owned by auth.uid()
**Edge cases handled:**
- Prevents a client who knows a foreign job UUID from making the worker submit using another user's source_url (FIX 7)
**Confidence:** High — Explicit JOIN/WHERE ownership clauses and the recreated RLS policy are both in the migration with cited fix numbers.

### RULE-033: Submission-worker RPCs are service-role only; clients cannot call them
**Category:** Validation
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:280-281, 416-417, 514-515`  ·  **BR:** BR-131, BR-148
**Plain English:** claim_submission, finalize_submission, and expire_stuck_submitting are SECURITY DEFINER with search_path pinned, and EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to service_role. Clients can never invoke them; they reach the queue only through their own RLS-scoped writes. The 'submitting'/'submitted'/'failed' statuses are written exclusively by the worker.
**Specification:**
```gherkin
Given An authenticated client tries to call claim_submission directly
When  The RPC is invoked
Then  Permission denied — EXECUTE is not granted to authenticated. Clients may only INSERT 'pending_approval'/'approved' or move a row to 'cancelled' via RLS
```
**Parameters:** SECURITY DEFINER; SET search_path=public,pg_temp; REVOKE EXECUTE FROM PUBLIC,anon,authenticated; GRANT EXECUTE TO service_role; client-allowed queue statuses: pending_approval, approved, cancelled
**Edge cases handled:**
- write_approval_event is the one exception granted to authenticated (with its own ownership + materials guards)
**Confidence:** High — Explicit REVOKE/GRANT statements on all three functions; matches BR-131/148.

### RULE-034: AI cost cap blocks non-critical calls; critical pipeline calls exempt
**Category:** Validation
**Priority:** P1
**Source:** `src/features/applications/services/aiScoringService.ts:62-78, 258-267`  ·  **BR:** BR-050, BR-052, BR-053
**Plain English:** Match scoring is a non-critical AI task gated by the $75/month cost cap: when routeAiTask reports the cap is reached, the scoring call is queued (not cancelled) and the deterministic heuristic fallback is persisted instead so the dashboard always gets a score. Critical pipeline calls (stage transitions, email classification) are never blocked by the cap.
**Specification:**
```gherkin
Given A user at the monthly AI cost cap requests match scoring for a job
When  scoreJobFitWithLlm calls routeAiTask('match_scoring') and route.costDecision.shouldBlock is true
Then  persistHeuristicFallback runs with reason 'cost_cap' and returns status 'queued'; the heuristic score is persisted flagged source='heuristic_fallback'. Email classification (critical) bypasses the cap entirely
```
**Parameters:** Hard cap $75.00/month (see src/lib/ai-router.ts); fallback reasons: 'cost_cap', 'edge_function_error'; recommendation derived from overall_score, never the LLM's own
**Edge cases handled:**
- A race where the cap is crossed between two route reads still persists the heuristic fallback to honor the queued contract
- Edge Function error also falls back to the heuristic so a score is always produced
**Confidence:** High — Cost-gate branch and heuristic-fallback persistence are explicit; aligns with BR-050/052/053. Exact cap constant lives in ai-router.ts (not re-read here).

### RULE-035: AI score thresholds drive discovery-stage promotion recommendation
**Category:** Validation
**Priority:** P1
**Source:** `src/features/applications/services/aiScoringService.ts:23-56`  ·  **BR:** BR-020, BR-021, BR-022, BR-142
**Plain English:** The persisted recommendation is always derived from the overall match score via fixed thresholds: >=80 'Auto-Submit Prep' (db 'apply'), >=60 'Consideration' (db 'consider'), <60 'Reject' (db 'reject'). The LLM's own recommendation is advisory only and never persisted as-is. A score below 60 keeps the job in discovery with a Reject recommendation.
**Specification:**
```gherkin
Given An overall match score of 72
When  buildScoringDecision derives the recommendation
Then  label='Consideration', db recommendation='consider' (job promoted to manual-review pipeline); a score of 80+ yields 'Auto-Submit Prep'/'apply' and <60 yields 'Reject'/'reject'
```
**Parameters:** Thresholds: >=80 apply (Auto-Submit Prep), >=60 consider (Consideration), <60 reject (Reject); these literals live only in getScoreLabel/toDbRecommendation (LSN-001)
**Confidence:** High — Threshold literals and the derived-not-advisory rule are explicit and centralized in aiScoringService.

### RULE-036: Email auto-action confidence gate (>= 0.70)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:50, 424-453`  ·  **BR:** BR-030, BR-031
**Plain English:** An email may only auto-transition an application's stage when classification confidence is at least 0.70. Below 0.70 the email is stored but never auto-actioned. The classification must also map to a stage and the target transition must be a legal one.
**Specification:**
```gherkin
Given An email classified 'rejection' at confidence 0.62 matched to an application in 'applied'
When  resolveAutoAction evaluates the decision
Then  Returns {action:'skip', reason:'Confidence below 0.70...'} — email stored, no transition. At confidence 0.72 it would map to 'rejected' and transition if legal
```
**Parameters:** AUTO_ACTION_CONFIDENCE_THRESHOLD=0.7; keyword confidence = clamp(0.58 + matches*0.12, 0.58, 0.97); zero keyword matches -> 'unknown' @ 0.50; Gemini confidence clamped 0..1; gmail_label confidence=0.95
**Edge cases handled:**
- A confidence exactly 0.70 passes (strict < comparison)
- No matched application -> skip even if confidence is high
**Confidence:** High — Threshold constant and the comparison are explicit; matches BR-030/031 exactly.

### RULE-037: Email relevance storage gate ('unknown' mail dropped unless matched or labeled)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:388-394`  ·  **BR:** BR-035
**Plain English:** An email is stored only if it is NOT classified 'unknown', OR it matched a tracked application's company, OR it carries a Gmail label mapped in gmail_label_map. All other mail (newsletters, receipts) is never stored.
**Specification:**
```gherkin
Given An email classified 'unknown' that did not match any application and carries no mapped label
When  shouldStoreEmail is evaluated
Then  Returns false -> email discarded (counted as skipped_irrelevant). If it matched a company or had a mapped label it would be stored
```
**Parameters:** Condition: classification !== 'unknown' OR matched !== null OR hasMappedLabel
**Edge cases handled:**
- A mapped Gmail label forces storage even when the model says 'unknown', so a curated signal is never silently dropped
**Confidence:** High — Single boolean expression matching BR-035 wording.

### RULE-038: Missing channel config fails to manual (never blind-fires)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/submission-worker/index.ts:168-186; supabase/functions/_shared/submission/browserAdapter.ts:41-129`  ·  **BR:** BR-146, BR-134
**Plain English:** When the resolved channel has no usable config, the worker records a manual-required failure rather than submitting. The 'manual' channel returns manual_required immediately. The browser channel returns browser_not_configured when Browserbase keys are absent, and even when configured it only bootstraps a session then hands off as manual_required (no unattended form-filling). BR-032/033/034 (no CAPTCHA bypass, no rate-limit circumvention, no auth-wall scraping) remain binding.
**Specification:**
```gherkin
Given A posting resolved to the browser channel with BROWSERBASE_API_KEY unset
When  browserAdapter runs
Then  Returns {success:false, channel:'browser', error:'browser_not_configured'}; finalize refunds the credit and records the failure; the row falls to manual with a visible reason
```
**Parameters:** BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID (credentials, masked — see browserAdapter.ts:45-46); endpoint POST https://api.browserbase.com/v1/sessions; manual channel -> 'manual_required'
**Edge cases handled:**
- Even a successful Browserbase bootstrap returns a FAILURE (manual_required) by design — full form-driving is a deferred spike
- No secret is ever echoed into audit metadata
**Confidence:** High — Explicit not-configured/handoff outcomes; signingKey deliberately omitted from metadata; matches BR-146/134.

### RULE-039: Prospector dedup by source_url (silent ON CONFLICT DO NOTHING)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:846-873, 930-950`  ·  **BR:** BR-063, BR-102
**Plain English:** Discovered jobs are upserted with ON CONFLICT(source_url) DO NOTHING. A duplicate source_url is silently skipped — no error, no duplicate row. jobs_queued counts only rows actually inserted (the select returns a row only on a true insert), so the audit figure means 'newly inserted after dedupe'.
**Specification:**
```gherkin
Given A SerpApi result whose source_url already exists in the jobs table
When  The upsert runs with onConflict:'source_url', ignoreDuplicates:true
Then  No row is inserted, .select('id') returns empty, jobs_queued is not incremented; no error raised
```
**Parameters:** onConflict:'source_url'; ignoreDuplicates:true; SOURCE_LABEL='prospector'; salary filter: discard only when min_salary set AND listed salary present AND highest listed < min_salary (null salary always retained)
**Edge cases handled:**
- A result lacking title or source_url is non-ingestable (jobs_found decremented, not an error)
- ATS board passes additionally post-filter by profile environment/job-type since site: query can't carry chips
**Confidence:** High — Explicit upsert options and insert-only counting; matches BR-063/102.

### RULE-040: Prospector employment-type chip mapping (uppercase enum)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:254-273`  ·  **BR:** BR-100
**Plain English:** Profile job_types are mapped to SerpApi's exact uppercase employment_type chip tokens. The wrong token silently zeroes results, so only the verified tokens are used; unrecognized job_types are dropped.
**Specification:**
```gherkin
Given profile.job_types=['full-time','contract']
When  buildSerpApiUrl constructs chips
Then  chips='employment_type:FULLTIME,employment_type:CONTRACTOR'
```
**Parameters:** Map: full-time→FULLTIME, part-time→PARTTIME, contract→CONTRACTOR, internship/intern→INTERN. Token must be uppercase enum 'employment_type:VALUE' (NOT 'job_type:fulltime')
**Edge cases handled:**
- ATS board-specific passes (site: operator) skip chips entirely and post-filter by isAllowedByProfileFilters instead, because chips interact poorly with site:.
**Confidence:** High — Explicit map with a critical comment documenting the silent-zero failure of the wrong token.

### RULE-041: Prospector job dedup by source_url (silent skip)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:850-872`  ·  **BR:** BR-063, BR-102
**Plain English:** Discovered jobs are upserted with ON CONFLICT(source_url) DO NOTHING (ignoreDuplicates). A job whose source_url already exists is silently skipped — no error, no duplicate row. jobs_queued counts only rows actually newly inserted (the upsert returns the row id only on a true insert).
**Specification:**
```gherkin
Given A SerpApi result whose apply URL already exists as a jobs.source_url
When  The upsert runs
Then  No row is inserted, no error is raised, and jobs_queued is not incremented for that result
```
**Parameters:** upsert onConflict:'source_url', ignoreDuplicates:true; .select('id') returns a row only on insert; source_url priority: apply_options[0].link > result.link > related_links[0].link > stable google-search fallback from job_id
**Confidence:** High — Upsert config and insert-detection via returned id are explicit.

### RULE-042: Prospector minimum-salary filter (null-safe)
**Category:** Validation
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:705-740`  ·  **BR:** BR-105
**Plain English:** When a prospecting profile sets a minimum salary, jobs that explicitly list a salary whose highest figure is below the minimum are discarded. Jobs with NO listed salary are always kept (absence of data is not treated as below-minimum).
**Specification:**
```gherkin
Given profile.min_salary=120000 and a job listing '73K–97K a year'
When  mapJobResult applies the salary filter
Then  highestListed = max(97000, 73000) = 97000 < 120000 → job discarded (returns null). A job with no salary string is retained regardless of min_salary.
```
**Parameters:** Comparison: highestListed < minSalary discards; highest = Math.max(max??-Infinity, min??-Infinity); filter only applies when min_salary != null AND the job has salary data
**Edge cases handled:**
- A job listing only a low *min* (e.g. '$50K+') with no max still discards if 50000 < threshold.
- Jobs with hourly salaries parsed as small integers (e.g. 50) will be discarded against any realistic annual min_salary — false negatives.
**Confidence:** High — Explicit null-handling and the strict-less-than discard are documented and coded.

### RULE-043: user_settings guardrail bounds enforced by DB CHECK constraints
**Category:** Validation
**Priority:** P1
**Source:** `supabase/migrations/20260612000001_create_user_settings.sql:10-28`  ·  **BR:** BR-130, BR-131, BR-136
**Plain English:** Autonomy guardrail values are bounded at the database layer: credits >= 0, monthly_budget_usd between 20 and 5000, auto_submit_score_threshold between 0 and 100, daily_submission_cap between 1 and 50, and review_mode constrained to review/assist/auto. Each user has exactly one settings row, auto-provisioned on user creation, RLS-scoped to its owner.
**Specification:**
```gherkin
Given A client attempts to set daily_submission_cap=200 on their own settings row
When  The UPDATE executes
Then  The CHECK (daily_submission_cap BETWEEN 1 AND 50) rejects it; the write fails. Defaults seed credits=141, monthly_budget_usd=240, threshold=80, cap=10, review_mode='review', paused=false
```
**Parameters:** credits CHECK>=0 default 141; monthly_budget_usd 20-5000 default 240; auto_submit_score_threshold 0-100 default 80; daily_submission_cap 1-50 default 10; review_mode in (review,assist,auto) default review; paused default false
**Edge cases handled:**
- No DELETE policy — settings live and die with the user via FK CASCADE
- Auto-provision trigger ensures a settings row always exists; claim_submission treats a missing row as not_claimable
**Confidence:** High — All CHECK constraints and defaults are explicit in the table DDL; matches the cited BRs.

### RULE-044: CSV ingestion requires source_url and title; enum fields coerced
**Category:** Validation
**Priority:** P2
**Source:** `src/features/applications/services/ingestionCsv.ts:160-186, 103-131`  ·  **BR:** BR-063
**Plain English:** A CSV import row is accepted only if it has both a non-empty source_url (aliases source_url/sourceurl/url) and a non-empty title (aliases title/job_title); otherwise the row is rejected with an issue. remote_type and application_method are coerced to their allowed enums or dropped if invalid. Rows are deduplicated by lowercased/trimmed source_url before insert.
**Specification:**
```gherkin
Given A CSV row missing source_url, and another row with application_method='carrier-pigeon'
When  parseIngestionCsv / dedupeBySourceUrl process the file
Then  The missing-url row is recorded as an issue ('Missing required columns source_url or title.') and skipped; the invalid application_method is dropped (set undefined). Duplicate source_urls (case-insensitive) go to duplicateRows
```
**Parameters:** required: source_url, title; remoteType in {remote,hybrid,onsite}; applicationMethod in {api,manual,ats}; dedup key = sourceUrl.trim().toLowerCase()
**Edge cases handled:**
- Empty/whitespace source_url after trim is treated as a duplicate (dropped) in dedupeBySourceUrl
- An empty CSV yields a single issue at rowNumber 1
**Confidence:** High — Required-field check, enum coercion, and dedup key are explicit functions.

### RULE-045: Self-sent / digest sender exclusion before classification
**Category:** Validation
**Priority:** P2
**Source:** `supabase/functions/gmail-sync/logic.ts:230-239`  ·  **BR:** BR-035
**Plain English:** Emails whose sender is the user's own address, or a known digest/no-reply sender (e.g. gemini-noreply@google.com), are skipped on sender alone before any classification — these quote real job mail and would fool the classifier.
**Specification:**
```gherkin
Given An email whose From address equals the connected account's own email, or contains 'gemini-noreply@google.com'
When  isExcludedSender is checked at the top of processMessage
Then  The message is skipped (skipped_irrelevant) before any Gemini call or storage
```
**Parameters:** EXCLUDED_SENDER_SUBSTRINGS=['gemini-noreply@google.com'] (lowercase substring match); self-email exact match
**Edge cases handled:**
- Substring match could over-exclude any address containing the listed substring
- Self-email match is exact (after lowercasing/header strip)
**Confidence:** High — Explicit exclusion list and match logic; documented rationale in comments.


---

## Lifecycle rules (16)

### RULE-046: application_events rows are append-only (never updated or deleted)
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260603000010_create_application_events.sql:89-129`  ·  **BR:** BR-003
**Plain English:** The application_events table is the immutable system-of-record. There are no UPDATE or DELETE RLS policies, and BEFORE UPDATE / BEFORE DELETE triggers raise an exception on any mutation attempt — even for service-role callers. GDPR erasure is satisfied by anonymising PII in place, never by deleting rows.
**Specification:**
```gherkin
Given Any existing application_events row
When  An UPDATE or DELETE is attempted at any role level
Then  fn_deny_application_event_mutation raises 'application_events_immutable' (ERRCODE P0001) and the operation fails
```
**Parameters:** event_type CHECK enum (stage_transition, score_override, approval, rejection, email_classified, interview_scheduled, interview_complete, offer_received, submission_attempt, document_linked, note_added, system_alert); actor CHECK enum (system, system_trigger, jb_manual, gmail_scraper, calendar_scraper, claude-opus-4, claude-sonnet-4-5, gpt-4o, gpt-5, gemini-2-5-pro, gemini-2-5-flash); triggers trg_app_events_deny_update / trg_app_events_deny_delete
**Confidence:** High — No-DELETE/no-UPDATE policy plus belt-and-suspenders triggers are explicit in DDL.

### RULE-047: Atomic stage transition with ownership + optimistic-lock + mandatory event
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260605000001_transition_stage_rpc.sql:5-37`  ·  **BR:** BR-002, BR-005
**Plain English:** Every stage change goes through transition_stage, which updates applications.stage only when the row is owned by the user AND currently in the expected from_stage (optimistic lock), and writes exactly one application_events row in the same transaction. If ownership or the expected stage fails, it raises and nothing changes.
**Specification:**
```gherkin
Given transition_stage called with p_from_stage='applied' for an application whose stage has already moved to 'screening'
When  The RPC runs the conditional UPDATE
Then  NOT FOUND -> raises 'Stage transition failed: ... stage has changed (expected applied)'; no event written. On match, stage updates and one stage_transition event is inserted atomically
```
**Parameters:** SECURITY INVOKER (RLS applies); p_actor default 'jb_manual'; event_type='stage_transition'; WHERE id AND user_id AND stage = p_from_stage
**Edge cases handled:**
- Runs as SECURITY INVOKER so RLS user-scoping is the real ownership boundary
- finalize_submission deliberately does NOT call this RPC (to avoid a duplicate event) and instead sets app.stage_event_written before its inline transition
**Confidence:** High — Explicit conditional UPDATE + IF NOT FOUND RAISE + same-transaction INSERT; matches BR-002/BR-005.

### RULE-048: claim_submission: server-side guardrail ladder before a submission fires
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:78-275`  ·  **BR:** BR-130, BR-131, BR-132, BR-135, BR-136, BR-148
**Plain English:** Before any real submission, the service-role claim_submission RPC re-validates every guardrail server-side on an 'approved' row, in order: row must still be approved; application AND job must belong to the queue row's user; not paused; credits>=1; under the rolling-24h daily cap (counting in-flight); under the monthly budget (counting in-flight); not already submitted; and authorized to submit. It then charges one credit and flips the row to 'submitting'. Client-supplied queued_by is audit-only and never an authorization input.
**Specification:**
```gherkin
Given An approved queue row for a user who is paused
When  claim_submission(queue_id) runs
Then  It returns {ok:false, reason:'paused'}, leaves the row 'approved' (transient), and charges nothing
```
**Parameters:** Guards in order with reasons: not_claimable, not_owned, paused (BR-132), no_credits (credits<1, BR-136), daily_cap (>= daily_submission_cap in 24h incl. submitting), monthly_budget_exhausted (>= monthly_budget_usd this month incl. submitting), already_submitted (-> cancelled), awaiting_approval; per-user pg_advisory_xact_lock serializes claims; charges credits = credits - 1 on success
**Edge cases handled:**
- already_submitted is the only guard that moves the row TERMINAL (cancelled); all other failures leave it 'approved' for retry
- awaiting_approval is NOT terminal — a below-threshold row is never cancelled, it waits for a future approval event
- Counts include in-flight 'submitting' rows to close the overlapping-run race
**Confidence:** High — Each guard, its reason code, and its terminal vs transient handling are explicit and commented in the RPC body.

### RULE-049: Documents are immutable once linked (is_locked) and versioned per user per type
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260603000006_create_documents.sql:30-74; supabase/migrations/20260603000009_create_application_materials.sql:28-50; src/features/applications/services/documentStorageService.ts:97-182`  ·  **BR:** BR-007, BR-070, BR-071, BR-072
**Plain English:** Linking a document to an application (inserting an application_materials row) fires a trigger that sets documents.is_locked=true. Once locked, any UPDATE to that document raises 'document_immutable' and is also blocked by the documents UPDATE RLS policy (which only permits is_locked=false rows). New content must be saved as a new version (version increments per user+type, UNIQUE). Documents are never deleted by the client.
**Specification:**
```gherkin
Given A resume document version already linked to an application (is_locked=true)
When  A client attempts to UPDATE that document
Then  fn_guard_locked_document raises 'document_immutable' (P0001) and the RLS UPDATE policy also excludes it; a new version row must be created instead
```
**Parameters:** is_locked DEFAULT false; UNIQUE(user_id, document_type, version); document_type CHECK IN (resume, cover_letter); link trigger fn_lock_linked_document (SECURITY DEFINER, sets is_locked only where currently false); VERSION_RETRY_LIMIT = 3; material_type CHECK IN (resume, cover_letter, attachment); no DELETE policy on documents or application_materials
**Edge cases handled:**
- createDocumentVersion retries up to 3 times on a version UNIQUE collision (concurrent version creation), reading the latest version each attempt
- application_materials has no UPDATE/DELETE policy — links are permanent
- write_approval_event requires a linked resume material to exist, coupling approval to the document-prep lifecycle
**Confidence:** High — Lock trigger, guard trigger, RLS update policy, and client createDocumentVersion increment logic are all explicit.

### RULE-050: Email classification confidence gate for auto-transition (>=0.70)
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/functions/gmail-sync/logic.ts:50,424-453`  ·  **BR:** BR-030, BR-031
**Plain English:** A classified email may auto-transition an application only when the classifier's confidence is at least 0.70 AND the email was matched to an application AND the classification maps to a stage AND that stage move is legal AND it is not already at that stage. Below 0.70 the email is stored but never auto-actioned.
**Specification:**
```gherkin
Given An email classified as 'interview_invite' at confidence 0.62 matched to an application in 'applied'
When  resolveAutoAction runs
Then  It returns {action:'skip', reason:'Confidence below 0.70...'} and no transition occurs; at confidence 0.72 it returns {action:'transition', toStage:'interview_scheduled'}
```
**Parameters:** AUTO_ACTION_CONFIDENCE_THRESHOLD = 0.7; STAGE_BY_CLASSIFICATION = {interview_invite->interview_scheduled, rejection->rejected, offer->offer}; classifications outreach/follow_up/unknown have no stage mapping
**Confidence:** High — Threshold constant and full guard ladder are explicit in resolveAutoAction.

### RULE-051: Every stage change must write an immutable application_events row (event sourcing)
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260605000001_transition_stage_rpc.sql:17-37; supabase/migrations/20260603000008_create_applications.sql:73-121`  ·  **BR:** BR-002, BR-003
**Plain English:** Stage transitions go through the transition_stage RPC, which atomically updates applications.stage AND inserts a 'stage_transition' application_events row in one transaction. As a safety net, an AFTER UPDATE trigger on applications.stage inserts a fallback event (actor='system_trigger') whenever the app layer did not already write one (detected via the session flag app.stage_event_written='true'). So no stage change can ever occur without an audit event.
**Specification:**
```gherkin
Given An application in 'discovery' owned by user U
When  transition_stage(app, U, 'discovery', 'applied', reason) is called
Then  applications.stage becomes 'applied' and exactly one stage_transition event (from=discovery, to=applied, actor=jb_manual default) is inserted in the same transaction; if the optimistic from_stage no longer matches, the whole call raises and nothing changes
```
**Parameters:** transition_stage default actor='jb_manual'; trigger fallback actor='system_trigger'; session flag 'app.stage_event_written'; RPC is SECURITY INVOKER (RLS applies)
**Edge cases handled:**
- Optimistic concurrency: transition_stage only updates WHERE stage = p_from_stage, so a stale from_stage raises 'stage has changed' and aborts
- finalize_submission deliberately sets app.stage_event_written BEFORE its inline stage UPDATE to suppress a duplicate trigger event (submission_worker_rpcs.sql:362-375)
- Trigger fires only on stage column change (AFTER UPDATE OF stage) and is a no-op when OLD.stage = NEW.stage
**Confidence:** High — RPC body and safety-net trigger are both explicit; the flag-coordination contract is documented in the migration comments.

### RULE-052: finalize_submission: success vs failure side-effects (only success consumes a credit)
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:306-411`  ·  **BR:** BR-135, BR-136, BR-002
**Plain English:** Closing out a 'submitting' row: on SUCCESS the queue row becomes 'submitted', applications.submitted_at is stamped, and if the application was in 'discovery' it transitions discovery->applied with exactly one stage_transition event, plus a submission_attempt event (outcome=success). On FAILURE the credit charged at claim is refunded, the row becomes 'failed', and a submission_attempt event (outcome=failure) is written. The RPC only acts on rows in 'submitting' (idempotent), so duplicate/stale calls cannot double-charge or double-transition.
**Specification:**
```gherkin
Given A 'submitting' row whose channel adapter reports failure
When  finalize_submission(queue_id, success=false, ...) runs
Then  user_settings.credits += 1 (refund), queue status -> failed with last_error, and a submission_attempt failure event is written; a success call instead stamps submitted_at, transitions discovery->applied, and writes a success event
```
**Parameters:** Acts only on status='submitting'; success refund = none; failure refund = credits + 1; discovery->applied only when stage='discovery'; sets app.stage_event_written='true' before inline stage update to suppress the safety-net trigger duplicate
**Confidence:** High — Both branches and the idempotency guard are explicit in the RPC body.

### RULE-053: Pipeline stage transitions are one-directional except ghosted->applied
**Category:** Lifecycle
**Priority:** P0
**Source:** `src/features/applications/domain/stageRules.ts:3-17`  ·  **BR:** BR-011, BR-013
**Plain English:** Stage transitions follow a fixed legal-transition map: each stage may only move forward to specific next stages, plus rejected/ghosted from active stages. Terminal stages hired and rejected allow no transitions; ghosted may only go to applied. The same table is duplicated server-side in gmail-sync.
**Specification:**
```gherkin
Given An application in stage 'hired'
When  canTransitionStage('hired', anyStage) is evaluated
Then  Returns false for every target (hired has an empty allowed list). 'ghosted'->'applied' returns true; 'discovery'->'screening' returns false (must go via 'applied')
```
**Parameters:** defaultTransitions map: discovery->[applied,rejected,ghosted]; applied->[screening,rejected,ghosted]; screening->[interview_scheduled,rejected,ghosted]; interview_scheduled->[interview_complete,rejected,ghosted]; interview_complete->[offer,rejected,ghosted]; offer->[hired,rejected]; hired->[]; rejected->[]; ghosted->[applied]
**Edge cases handled:**
- The map is duplicated in client (stageRules.ts) and server (gmail-sync logic.ts) — drift risk if one is edited without the other
- transition_stage RPC enforces the from_stage optimistic lock but does NOT itself check legality; legality is enforced by callers (applicationService.ts:90)
- ghosted is the ONLY stage with a backward edge (->applied)
- offer cannot transition to ghosted (only hired/rejected)
- hired and rejected are dead-ends with no exits
- Same map is hand-duplicated in the gmail-sync Edge Function (logic.ts ALLOWED_TRANSITIONS) and in submittedCount.ts SUBMITTED_STAGES — three copies must stay in sync
**Confidence:** High — Transition map is an explicit literal; duplicated identically in gmail-sync/logic.ts:403-413.

### RULE-054: Stuck 'submitting' rows expire to terminal failed (never auto-resubmit)
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:441-509`  ·  **BR:** BR-136, BR-147
**Plain English:** A row stuck in 'submitting' past the cutoff (default 30 minutes) is moved to the TERMINAL 'failed' state, not back to 'approved' — it may have submitted externally without finalize recording it, so it must never be auto-resubmitted. The credit is refunded per user by exact count, and each expiry writes a submission_attempt event flagged outcome='unconfirmed' for manual reconciliation.
**Specification:**
```gherkin
Given A queue row in 'submitting' with last_attempt_at older than 30 minutes
When  expire_stuck_submitting() runs at the start of each live tick
Then  Both rows -> failed (last_error='expired_unconfirmed_submitting'), that user's credits += 2 (exact count), and two submission_attempt outcome='unconfirmed' events are written; the rows are never auto-resubmitted
```
**Parameters:** p_older_than default interval '30 minutes'; refund aggregated per user by count; FOR UPDATE SKIP LOCKED
**Edge cases handled:**
- Terminal failed requires manual reconciliation; the worker only ever claims 'approved' rows so it is never re-picked
- Aggregate-per-user refund avoids over- or under-refunding multi-stuck users
**Confidence:** High — Explicit CTE pipeline (stuck/per_user/refunded/expired/logged) with documented rationale; matches BR-147.

### RULE-055: Submission queue state machine: client vs worker-owned statuses
**Category:** Lifecycle
**Priority:** P0
**Source:** `supabase/migrations/20260612000004_create_application_queue.sql:18-78; src/features/applications/services/submissionQueueService.ts:41-158`  ·  **BR:** BR-133, BR-148
**Plain English:** Each application has at most one application_queue row (UNIQUE application_id). Clients may only create rows in pending_approval or approved, and may only move their own pending_approval/approved rows to cancelled. The worker-only statuses submitting, submitted, and failed are written exclusively by the service-role worker; RLS blocks clients from writing them. There is no DELETE policy — cancelled rows are kept for audit.
**Specification:**
```gherkin
Given A client-owned queue row in status 'submitting'
When  The client attempts to update or cancel it
Then  RLS rejects it (client UPDATE USING clause only permits pending_approval/approved); cancelQueued treats it as a safe no-op
```
**Parameters:** status CHECK IN (pending_approval, approved, submitting, submitted, failed, cancelled) DEFAULT pending_approval; queued_by CHECK IN (user, assist_mode, auto_mode); channel CHECK IN (api, ats, browser, manual); UNIQUE(application_id); client INSERT allows only pending_approval/approved; client UPDATE USING {pending_approval,approved} WITH CHECK {pending_approval,approved,cancelled}; CANCELLABLE_STATUSES = {pending_approval, approved}
**Edge cases handled:**
- Second enqueue of the same application raises 23505 and is treated as 'already queued' (re-fetch existing row) rather than an error
- A row already submitting/submitted/failed/cancelled is non-cancellable by the client
**Confidence:** High — Status enum, per-role RLS policies, and client guard set are all explicit.

### RULE-056: Calendar interview detection auto-schedules and transitions to interview_scheduled
**Category:** Lifecycle
**Priority:** P1
**Source:** `src/features/applications/services/calendarIntelligenceService.ts:116-156,238-308`
**Plain English:** An interview-looking calendar event is matched to an application using company name / email-domain / recruiter-domain / job-title heuristics scored on a point system. A match requires a total score of at least 5. On a match the system inserts an interviews row (status 'scheduled') and, if the application is not already in interview_scheduled and the transition is legal, transitions it to interview_scheduled.
**Specification:**
```gherkin
Given A calendar event titled with an interview keyword whose company name matches an application in 'screening' (score 5)
When  processCalendarSignal runs
Then  An interview row is created and the application transitions screening -> interview_scheduled (a legal transition)
```
**Parameters:** Match threshold score >= 5; scoring weights: company-name-in-title +5, company-domain match +4, recruiter-domain match +3, job-title-first-word +1; INTERVIEW_KEYWORDS = [interview, screen, onsite, on-site, hiring manager, recruiter, panel]; interviews dedup UNIQUE(user_id, calendar_event_id)
**Edge cases handled:**
- If currentStage is e.g. 'discovery', canTransitionStage(discovery, interview_scheduled) is false, so the interview row is still created but no stage transition occurs (reason records 'not allowed')
- Already-in-interview_scheduled match creates no duplicate transition
**Confidence:** High — Scoring weights, >=5 threshold, and transition guard are all explicit.

### RULE-057: Default stage on application creation is 'discovery'
**Category:** Lifecycle
**Priority:** P1
**Source:** `supabase/migrations/20260603000008_create_applications.sql:26-37`  ·  **BR:** BR-010, BR-013
**Plain English:** Every newly created application starts in the 'discovery' stage. The stage column is NOT NULL with a DB-level CHECK enum restricting it to the nine valid pipeline stages.
**Specification:**
```gherkin
Given A new row is inserted into applications without specifying stage
When  The INSERT commits
Then  stage defaults to 'discovery'; any value outside the nine-stage enum is rejected by the CHECK constraint
```
**Parameters:** DEFAULT 'discovery'; CHECK stage IN (discovery, applied, screening, interview_scheduled, interview_complete, offer, hired, rejected, ghosted); UNIQUE(user_id, job_id) one application per user per job; match_score CHECK BETWEEN 0 AND 100
**Confidence:** High — Explicit DEFAULT and CHECK constraint in DDL.

### RULE-058: Gmail ingestion is deduplicated and cursor held back on truncated run
**Category:** Lifecycle
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/index.ts:393-456`  ·  **BR:** BR-036
**Plain English:** Gmail ingestion is incremental via gmail_sync_state.history_id. Already-ingested messages are filtered out before processing (and a UNIQUE(user_id, gmail_message_id) on emails catches races as a benign no-op). The history cursor is advanced ONLY when the run drained every unseen message; a truncated run keeps the old cursor so nothing is skipped next time.
**Specification:**
```gherkin
Given A run that fetches 80 unseen messages but processes only MAX_MESSAGES_PER_RUN of them
When  The run finishes
Then  processedAllUnseen is false, so gmail_sync_state.history_id is left at the prior cursor (not advanced) so the remaining messages are re-listed next run
```
**Parameters:** emails UNIQUE(user_id, gmail_message_id); 23505 on insert treated as benign skip; cursor = processedAllUnseen ? listing.newHistoryId : prior history_id; MIN_SECONDS_BETWEEN_RUNS = 60
**Confidence:** High — Cursor hold-back logic and dedupe lookup are explicit in the handler.

### RULE-059: prospecting_runs status lifecycle (run outcome classification)
**Category:** Lifecycle
**Priority:** P1  ⚠️ *suspected defect — see below*
**Source:** `supabase/migrations/20260607000001_add_prospecting_tables.sql:155-186; supabase/functions/prospector-cron/index.ts:151,954-966`  ·  **BR:** BR-106
**Plain English:** Every prospector execution writes one immutable prospecting_runs audit row. Its status is resolved from the run outcome: 'empty' when zero jobs were found and no errors (BR-106), 'error' when there were errors and nothing was queued, 'partial' when there were errors but some jobs were queued, otherwise 'success'. The table is append-only (no UPDATE/DELETE) and enforces jobs_queued <= jobs_found.
**Specification:**
```gherkin
Given A prospector run that finds 12 jobs but one SerpApi title query errored while others succeeded and queued jobs
When  runForProfile resolves the final status
Then  status='partial' (errors present, jobs_queued>0); a run finding zero jobs with no errors resolves to 'empty'
```
**Parameters:** DB CHECK status IN (success, empty, partial, error, queued); code RunStats.status type emits only success|empty|partial|error; jobs_found/jobs_queued NOT NULL DEFAULT 0 CHECK >=0; CHECK jobs_queued <= jobs_found; no UPDATE/DELETE policy (append-only, BR-003 extended)
**⚠️ Suspected defect:** The DB CHECK allows status='queued' (documented for BR-104: AI scoring deferred due to cost cap), but the prospector-cron RunStats.status union and its resolution logic NEVER emit 'queued' — the BR-104 cost-cap-deferred prospector run state is unreachable from this function, so a cost-capped scoring run cannot be recorded as 'queued'.
**Confidence:** High — Status-resolution ladder is explicit in runForProfile; CHECK constraint and append-only policies explicit in DDL.

### RULE-060: Gmail/Calendar auto-transitions are attributed to scraper actors
**Category:** Lifecycle
**Priority:** P2
**Source:** `supabase/functions/gmail-sync/index.ts:200-219; src/features/applications/services/calendarIntelligenceService.ts:277-285`  ·  **BR:** BR-002, BR-031
**Plain English:** When the Gmail sync auto-transitions a stage it records the event with actor='gmail_scraper'; calendar interview detection records actor='calendar_scraper'. The reason string captures the originating classification or detection so the audit log distinguishes autonomous moves from manual ones.
**Specification:**
```gherkin
Given A high-confidence interview_invite email triggers an auto-transition
When  transition_stage is invoked from gmail-sync
Then  The application_events row records actor='gmail_scraper' and reason 'Auto-transition from Gmail classification: interview_invite'
```
**Parameters:** gmail auto-action actor='gmail_scraper'; calendar actor='calendar_scraper'; both must be in the application_events actor CHECK enum
**Confidence:** High — Actor values passed explicitly and present in the application_events actor enum.

### RULE-061: Interview record status lifecycle
**Category:** Lifecycle
**Priority:** P2
**Source:** `supabase/migrations/20260603000012_create_interviews.sql:19-20,48-55`
**Plain English:** An interview record carries its own status field independent of the application stage: scheduled (default), complete, cancelled, or rescheduled. Status changes happen via UPDATE; there is no DELETE policy, so interview history is permanent. Calendar-detected interviews are inserted as 'scheduled'.
**Specification:**
```gherkin
Given An interview row created from a calendar event
When  It is inserted
Then  status defaults to 'scheduled'; it may later be UPDATEd to complete/cancelled/rescheduled but never deleted
```
**Parameters:** status CHECK IN (scheduled, complete, cancelled, rescheduled) DEFAULT 'scheduled'; interview_type CHECK IN (phone, video, onsite, panel); no DELETE policy
**Confidence:** High — Status enum and no-delete policy explicit in DDL; calendar service inserts status:'scheduled'.


---

## Policy rules (19)

### RULE-062: Anthropic model display-name to API id mapping (silent swap)
**Category:** Policy
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `supabase/functions/_shared/llm/anthropic.ts:12-18`  ·  **BR:** BR-103, BR-120, BR-140
**Plain English:** The pinned display name 'Claude Opus 4.6' is mapped to the API model id 'claude-opus-4-8' when calling Anthropic. So every Opus 4.6-routed task (match_scoring, cover_letter_generation, interview_prep) actually invokes a different model than its pinned name, while it is priced/logged as Opus 4.6.
**Specification:**
```gherkin
Given A match_scoring call routed to display name 'Claude Opus 4.6'
When  anthropicProvider.resolveModelId('Claude Opus 4.6') runs
Then  Returns API id 'claude-opus-4-8' (NOT a 4.6 id); the request body uses claude-opus-4-8 while cost logging uses the 'Claude Opus 4.6' rate ($15/$75 per 1M)
```
**Parameters:** MODEL_ID_BY_NAME: 'Claude Sonnet 4.6'→claude-sonnet-4-6; 'Claude Opus 4.6'→claude-opus-4-8; 'Claude Opus 4.8'→claude-opus-4-8; 'Claude 3.5 Haiku'→claude-3-5-haiku-latest; DEFAULT_MODEL_ID=claude-sonnet-4-6 for any unknown name
**⚠️ Suspected defect:** Pinned name 'Claude Opus 4.6' silently resolves to API id 'claude-opus-4-8' — the model actually billed/invoked differs from the routed/pinned/logged name. Cost is logged against the 4.6 rate while a different model serves the request, breaking the price-accuracy assumption of BR-054 and the model-pinning contract.
**Confidence:** High — Mapping table is explicit; both 'Claude Opus 4.6' and 'Claude Opus 4.8' resolve to the same claude-opus-4-8 id, confirming the swap.
**SME question:** Is the intended production model for the 'match_scoring' / Opus tasks claude-opus-4-8, and should the pinned display name + MODEL_PRICING be corrected to match (so usage logging reflects the model actually called)?

### RULE-063: application_events are append-only (no UPDATE/DELETE, even by service role)
**Category:** Policy
**Priority:** P0
**Source:** `supabase/migrations/20260603000010_create_application_events.sql:89-129`  ·  **BR:** BR-003
**Plain English:** application_events is the immutable system of record. There are no UPDATE or DELETE RLS policies, and BEFORE UPDATE/DELETE triggers raise an exception that cannot be bypassed even by service-role callers. GDPR erasure is handled by anonymizing PII in place, never by deleting rows.
**Specification:**
```gherkin
Given Any caller (client or service role) attempts to UPDATE or DELETE an application_events row
When  The statement executes
Then  fn_deny_application_event_mutation raises 'application_events_immutable: rows ... may not be UPDATE/DELETE' (ERRCODE P0001); the mutation is blocked
```
**Parameters:** BEFORE UPDATE and BEFORE DELETE triggers; no UPDATE/DELETE RLS policy; SELECT/INSERT own-row only; event_type and actor constrained by CHECK enums
**Edge cases handled:**
- INSERT-time approval events are additionally restricted: client INSERTs of event_type='approval' are blocked by the tightened RLS policy
**Confidence:** High — Triggers and absence of mutation policies are explicit; matches BR-003/SEC-007.

### RULE-064: Approval events are server-trusted only (forge prevention)
**Category:** Policy
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:570-657; src/features/applications/services/submissionApprovalService.ts:207-235`  ·  **BR:** BR-130, BR-131, BR-005
**Plain English:** Clients are blocked by RLS from inserting any application_events row with event_type='approval' (the INSERT policy now requires event_type <> 'approval'). The only way to record an approval is the write_approval_event SECURITY DEFINER RPC, which verifies the caller owns the application AND that a resume material has already been linked (proving the document-prep flow ran), then inserts an approval event with actor='jb_manual'. This prevents a client from forging an approval to make the worker submit on a bare application.
**Specification:**
```gherkin
Given An authenticated client trying to insert an application_events row with event_type='approval' directly
When  The INSERT hits RLS
Then  It is rejected by the WITH CHECK (event_type <> 'approval'); the only accepted path is write_approval_event, which additionally requires a linked resume material or it raises
```
**Parameters:** App events INSERT policy WITH CHECK: user_id = auth.uid() AND event_type <> 'approval'; write_approval_event requires auth.uid() ownership AND application_materials material_type='resume' exists; inserts actor='jb_manual'; EXECUTE granted to authenticated, revoked from public/anon
**Confidence:** High — Tightened RLS policy and the RPC ownership + linked-resume checks are explicit in the migration.

### RULE-065: Daily submission cap (rolling 24h, incl. in-flight)
**Category:** Policy
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:174-190; supabase/migrations/20260612000001_create_user_settings.sql:23`  ·  **BR:** BR-131, BR-136
**Plain English:** A user may not have more than daily_submission_cap submissions in any rolling 24-hour window. The count includes both confirmed 'submitted' rows and in-flight 'submitting' claims, so overlapping worker runs cannot exceed the cap.
**Specification:**
```gherkin
Given A user with daily_submission_cap=10 who already has 7 'submitted' + 3 'submitting' rows in the last 24h
When  claim_submission is called for an 11th row
Then  count=10 >= 10 → returns {ok:false, reason:'daily_cap'}; the row stays 'approved' to retry after the window rolls (no charge, no submit)
```
**Parameters:** daily_submission_cap default 10, CHECK BETWEEN 1 AND 50; window = now() - interval '24 hours' (rolling, not calendar day); counts status IN ('submitted' by submitted_at, 'submitting' by last_attempt_at)
**Edge cases handled:**
- Rolling 24h means the cap can be hit again immediately after a burst (no calendar-day reset).
- In-flight 'submitting' rows count toward the cap; a stuck row not yet expired temporarily consumes a slot until expire_stuck_submitting (30 min) frees it.
**Confidence:** High — SQL counts and comparison are explicit; bounds enforced by CHECK constraint.

### RULE-066: Live submission worker must have CRON_SECRET (fail closed)
**Category:** Policy
**Priority:** P0  ⚠️ *suspected defect — see below*
**Source:** `supabase/functions/submission-worker/index.ts:97-118,512-536`
**Plain English:** The worker endpoint is deployed --no-verify-jwt so pg_cron can call it. In live mode it refuses to run unless a CRON_SECRET is configured, returning 503. When the secret is set, every request must present it (x-cron-secret header or Authorization Bearer), compared via constant-time SHA-256 equality. In dry-run/shadow with no secret the endpoint is open (no external submission happens).
**Specification:**
```gherkin
Given SUBMISSION_LIVE='true' but CRON_SECRET is unset
When  The endpoint is invoked
Then  It returns 503 'live mode requires CRON_SECRET' and submits nothing; with the secret unset in dry-run mode the request is allowed
```
**Parameters:** isCronAuthorized: if secret set, require x-cron-secret OR 'Bearer <secret>' via timingSafeEqual; if unset, allowed only when NOT live; live+no-secret -> 503; CRON_SECRET is <credential — masked, see submission-worker/index.ts:108>
**⚠️ Suspected defect:** Sibling Edge Functions prospector-cron and gmail-sync are also --no-verify-jwt but (unlike submission-worker) have NO CRON_SECRET gate at all, so those autonomous-write endpoints are publicly invokable.
**Confidence:** High — Fail-closed branch and constant-time comparison are explicit.

### RULE-067: Submission authorization: explicit approval event OR autonomous review_mode + score
**Category:** Policy
**Priority:** P0
**Source:** `supabase/migrations/20260613000004_submission_worker_rpcs.sql:221-249; src/features/applications/services/submissionQueueService.ts:203-224`  ·  **BR:** BR-130, BR-131
**Plain English:** A queued submission may proceed only if EITHER an explicit human approval exists (an application_events row with event_type='approval' for that application/user) which authorizes any review mode, OR the autonomous criteria hold: the server's user_settings.review_mode is 'assist' or 'auto' AND the server-side match_score is at least auto_submit_score_threshold. In 'review' mode nothing auto-enqueues; the client decision helper mirrors this but is advisory.
**Specification:**
```gherkin
Given A user in review_mode='review' with an approved queue row but no approval event
When  claim_submission evaluates authorization
Then  Neither path holds, so it returns {ok:false, reason:'awaiting_approval'} and leaves the row approved; with an approval event present it would proceed
```
**Parameters:** review_mode IN (review, assist, auto) default 'review'; auto_submit_score_threshold default 80 (CHECK 0..100); autonomous_ok = review_mode IN (assist,auto) AND match_score >= threshold; approval = EXISTS application_events event_type='approval'; client decideQueueAction: review->never, assist/auto + score>=threshold -> approved (queued_by assist_mode/auto_mode)
**Confidence:** High — Both authorization paths are explicit in the RPC; client helper documents the same semantics and reads the threshold from user_settings (no literal).

### RULE-068: SUBMISSION_LIVE kill-default (zero-side-effect dry-run unless explicitly live)
**Category:** Policy
**Priority:** P0
**Source:** `supabase/functions/submission-worker/index.ts:60-70, 548-568`  ·  **BR:** BR-146
**Plain English:** The submission worker defaults to a zero-side-effect dry-run. Real submissions fire only when SUBMISSION_LIVE is exactly the string 'true'. A shadow mode (SUBMISSION_SHADOW='true') builds and saves the real request for review but POSTs nothing and charges nothing. Mode precedence is live > shadow > dry-run.
**Specification:**
```gherkin
Given The worker is invoked with neither SUBMISSION_LIVE nor SUBMISSION_SHADOW set
When  The handler resolves mode
Then  runDry executes: it counts approved rows read-only and performs no claim/charge/submit/finalize. Only SUBMISSION_LIVE==='true' triggers runLive
```
**Parameters:** SUBMISSION_LIVE must equal exactly 'true'; SUBMISSION_SHADOW='true'; live wins if both set; DEFAULT_BATCH_SIZE=10; SCAN_MULTIPLIER=4
**Edge cases handled:**
- Any value other than the exact string 'true' (e.g. 'TRUE', '1') leaves the worker in dry-run — fail-safe
**Confidence:** High — isLive()/isShadow() string-equality checks and mode precedence are explicit; matches BR-146.

### RULE-069: Channel resolution: API-first ATS vs browser fallback vs manual
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/_shared/submission/resolveChannel.ts:36-91`  ·  **BR:** BR-134
**Plain English:** A posting submits via an ATS adapter only when application_method is 'api'/'ats' AND the source URL host is a known ATS vendor (Greenhouse/Lever/Ashby). A known method on an unknown host, or method 'manual'/null/anything else, falls back to the browser channel. The worker never blind-fires an ATS adapter it cannot address.
**Specification:**
```gherkin
Given A job with application_method='api' and source_url host 'jobs.lever.co'
When  resolveChannel runs
Then  Returns {channel:'api', vendor:'lever'} -> lever adapter. If the host were unknown (e.g. acme.com) it returns {channel:'browser', vendor:null}
```
**Parameters:** Vendor hosts: greenhouse=boards.greenhouse.io/job-boards.greenhouse.io; lever=jobs.lever.co; ashby=jobs.ashbyhq.com/*.ashbyhq.com; methods recognized: 'api','ats' (else browser)
**Edge cases handled:**
- An unparseable URL yields vendor null -> browser fallback
- 'api' vs 'ats' label is preserved for audit but both route to the same vendor adapter
**Confidence:** High — Pure host-detection and method-mapping logic is fully explicit; matches BR-134.

### RULE-070: Email classification is a critical task: never blocked by AI cost cap; usage always logged
**Category:** Policy
**Priority:** P1  ⚠️ *suspected defect — see below*
**Source:** `supabase/functions/gmail-sync/index.ts:148-198`  ·  **BR:** BR-053, BR-054
**Plain English:** The Gemini email-classification call is always attempted regardless of the monthly AI cost cap, and every call (including failed/zero-token ones falling back to keywords) logs an ai_model_usage row. On Gemini failure or unparseable reply, the deterministic keyword classifier is the fallback.
**Specification:**
```gherkin
Given The monthly AI cost cap has been reached
When  gmail-sync classifies a new email
Then  The Gemini call still runs (critical task, never cost-blocked) and an ai_model_usage row is written with tokens and estimated cost
```
**Parameters:** GEMINI_MODEL_NAME = 'Gemini 2.5 Flash'; GEMINI_MAX_TOKENS = 64; thinkingBudget = 0; input price 0.3/1e6 USD/token, output 2.5/1e6 USD/token (logic.ts:459-460)
**⚠️ Suspected defect:** gmail-sync is deployed --no-verify-jwt (per brief) with only a 60s re-invocation guard (MIN_SECONDS_BETWEEN_RUNS) and NO CRON_SECRET, so the autonomous stage-transition endpoint is publicly invokable.
**Confidence:** High — classifyEmail unconditionally inserts ai_model_usage and never consults the cost cap.

### RULE-071: Gmail label is authoritative classification (skips Gemini, confidence 0.95)
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/gmail-sync/logic.ts:332-379`  ·  **BR:** BR-035, BR-037
**Plain English:** When a message carries a Gmail label mapped in the user's gmail_label_map, that mapping is authoritative: it sets the classification at confidence 0.95 (source 'gmail_label') and the Gemini call is skipped. When several mapped labels are present, the most consequential one wins by a fixed priority order.
**Specification:**
```gherkin
Given A message carrying a mapped label for 'offer' and one for 'follow_up'
When  resolveLabelClassification runs against the user's label map
Then  Returns the 'offer' classification at confidence 0.95 (offer outranks follow_up in CLASSIFICATION_PRIORITY); Gemini is not called
```
**Parameters:** GMAIL_LABEL_CONFIDENCE=0.95; CLASSIFICATION_PRIORITY=[offer, rejection, interview_invite, outreach, follow_up, unknown]; case-insensitive label match
**Edge cases handled:**
- Label classification still flows through the 0.70 auto-action gate and transition legality (0.95 always passes the gate)
- Empty label list or empty map returns null and falls back to Gemini/keywords
**Confidence:** High — Explicit confidence constant, priority array, and skip-Gemini wiring in index.ts:246-247.

### RULE-072: Gmail send rolling-minute rate guard (10/min)
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/gmail-send/index.ts:31,117-131,263-265`  ·  **BR:** BR-033, BR-038
**Plain English:** A user may send at most 10 emails per rolling 60-second window via gmail-send, counted from the 'email_sent' notification audit rows. The 11th within the window is rejected with HTTP 429.
**Specification:**
```gherkin
Given A user who has 10 'email_sent' notifications in the last 60 seconds
When  an 11th send is attempted
Then  count (10) >= MAX_SENDS_PER_MINUTE (10) -> returns 429 'Rate limit: max 10 sends per minute'; no send. Draft mode is not rate-limited
```
**Parameters:** MAX_SENDS_PER_MINUTE=10; window = now - 60,000ms (rolling); counted by notifications where notification_type='email_sent'; guard fails OPEN (allows send) if the lookup errors
**Edge cases handled:**
- Guard fails open on a DB error (a lookup failure lets the send through), so the cap is best-effort not hard.
- Draft generation (Gemini 2.5 Flash, max 512 tokens) is never auto-sent — human review required.
- Fail-open on guard lookup error is a deliberate availability tradeoff — a DB error lets the send through
- Every successful send writes an email_sent audit row, which also feeds the guard
**Confidence:** High — Constant, cutoff, and the >= comparison are explicit.

### RULE-073: Job deduplication by source_url
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:846-872,930-949`  ·  **BR:** BR-063, BR-102
**Plain English:** Discovered jobs are deduplicated by source_url: an upsert with ON CONFLICT(source_url) DO NOTHING silently skips duplicates. jobs_queued counts only rows actually inserted (the duplicate returns an empty set).
**Specification:**
```gherkin
Given A job whose source_url already exists in the jobs table
When  the upsert runs with onConflict 'source_url', ignoreDuplicates true
Then  No row inserted, no error raised, .select('id') returns empty, jobs_queued is not incremented
```
**Parameters:** Conflict key = source_url (UNIQUE); ignoreDuplicates=true (DO NOTHING); jobs_queued = count of truly-inserted rows; jobs_found = ingestable results; jobs_fetched_raw = all results
**Edge cases handled:**
- source_url fallback for results lacking a real apply URL is a synthetic google search URL keyed by job_id, which still guarantees dedup but is not a real apply link.
**Confidence:** High — Upsert options and the inserted-only counting are explicit.

### RULE-074: Prospector cron frequency, activation, and per-profile isolation
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:1011,1034-1102`  ·  **BR:** BR-100, BR-107
**Plain English:** The prospector cron processes only active profiles (is_active=true filtered at query time, BR-107); deactivating a profile halts its cron runs immediately. The schedule (0 8,18 UTC) enforces a twice-per-24h maximum (BR-100). A failure in one profile's run is isolated (caught, logged as a synthetic status='error' run) and never aborts processing of other profiles. After each run the profile's last_run_at and next_run_at (now + 12h) are updated.
**Specification:**
```gherkin
Given Three active profiles where the second throws an unexpected error mid-run
When  The cron iterates profiles
Then  Profile 2 gets a prospecting_runs row with status='error' and the loop continues to profile 3; deactivated profiles are never queried at all
```
**Parameters:** Schedule 0 8,18 * * * UTC (twice daily); filter .eq('is_active', true); next_run_at = now + 12*3600000 ms; per-profile try/catch synthesizes status='error'; one profile per user (UNIQUE user_id, BR-101)
**Confidence:** Medium — is_active filter, per-profile isolation, and next_run_at math are explicit in code. The twice-daily cap itself lives in the pg_cron schedule (external to this repo file) and is only asserted in the header comment; the code 'trusts the scheduler' rather than enforcing the cap.
**SME question:** Where is the pg_cron schedule for prospector-cron defined and verified to be exactly twice daily, and is there any guard preventing a manual re-invocation (or a duplicate cron) from exceeding the BR-100 twice-per-24h cap, given the function itself does not check last_run_at before running?

### RULE-075: Prospector SerpApi 429 exponential backoff
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/prospector-cron/index.ts:173-175,387-422`  ·  **BR:** BR-033
**Plain English:** On a SerpApi 429 (rate limited), the request is retried with exponential backoff up to 3 times; after that it throws. Non-429 HTTP errors are not retried.
**Specification:**
```gherkin
Given SerpApi returns 429 on the first two attempts then 200
When  fetchSerpApi retries
Then  Waits 1000ms, 2000ms, 4000ms between attempts (BACKOFF_BASE_MS * 2^attempt), then throws 'SerpApi rate limit hit after 3 retries' on the 4th failure
```
**Parameters:** BACKOFF_MAX_RETRIES=3; BACKOFF_BASE_MS=1000; delay = BASE * 2^attempt (1s, 2s, 4s); only HTTP 429 retried; HTTP 200 with an 'error' field is a soft-empty (logged, not retried)
**Edge cases handled:**
- SerpApi 'soft' failures return HTTP 200 with an error field and zero results — not retried, silently empty (the wrong-chips bug previously hid here).
- SerpApi soft errors (HTTP 200 with error field) are logged but return zero results — distinguishes genuine empty from malformed query
**Confidence:** High — Constants and the 2^attempt formula are explicit.

### RULE-076: Submission worker finalize retry / stuck-row cutoff
**Category:** Policy
**Priority:** P1
**Source:** `supabase/functions/submission-worker/index.ts:202-253; supabase/migrations/20260613000004_submission_worker_rpcs.sql:441-443`  ·  **BR:** BR-147
**Plain English:** A successful submission's finalize is retried up to 3 times with linear backoff so a transient DB error can't strand a real submission; a failure outcome is finalized once. Rows stuck in 'submitting' beyond 30 minutes are self-healed to 'failed'.
**Specification:**
```gherkin
Given A successful submission whose first two finalize_submission calls hit a transient DB error
When  finalizeWithRetry runs
Then  Retries at 200ms then 400ms (FINALIZE_BACKOFF_MS * attempt); succeeds by attempt 3. A failure outcome gets a single finalize attempt.
```
**Parameters:** FINALIZE_MAX_ATTEMPTS=3 (success only; failure=1); FINALIZE_BACKOFF_MS=200 (linear: 200ms, 400ms); expire_stuck_submitting default cutoff = 30 minutes
**Edge cases handled:**
- A successful submission whose finalize fails after all 3 retries logs CRITICAL and requires manual reconciliation (credit not refunded, app not marked submitted).
**Confidence:** High — Constants and retry loop explicit; finalize is idempotent so retries are safe.

### RULE-077: JD formatting bounded per prospector run
**Category:** Policy
**Priority:** P2
**Source:** `supabase/functions/prospector-cron/index.ts:165-171, 532-587`  ·  **BR:** BR-054
**Plain English:** At most 25 newly-discovered job descriptions are formatted to Markdown per run (jd_formatting -> Claude 3.5 Haiku), so a large discovery batch cannot blow the function timeout or run up cost. Any formatting failure is logged and skipped (never blocks discovery); unformatted jobs are backfilled lazily on first view. Each call logs an ai_model_usage row.
**Specification:**
```gherkin
Given A run that inserts 60 new jobs with descriptions
When  formatAndStoreNewJobs runs
Then  Only the first 25 are formatted this run; the rest fall back to raw description and backfill lazily later; each formatted job logs tokens + estimated cost
```
**Parameters:** JD_FORMAT_MAX_PER_RUN=25; JD_FORMAT_MODEL_NAME='Claude 3.5 Haiku'; JD_HAIKU_INPUT=0.8/1e6 USD/token; JD_HAIKU_OUTPUT=4/1e6 USD/token
**Edge cases handled:**
- Missing ANTHROPIC_KEY skips formatting entirely (logged, not fatal)
**Confidence:** High — Explicit slice(0,25) cap and per-call usage logging; matches AI-RULE-002/BR-054.

### RULE-078: Prospector JD formatting per-run bound and cost
**Category:** Policy
**Priority:** P2
**Source:** `supabase/functions/prospector-cron/index.ts:163-171,532-587`  ·  **BR:** BR-054
**Plain English:** At most 25 newly-discovered job descriptions are formatted into Markdown per run (via Claude 3.5 Haiku) to bound cost/timeout; the rest backfill lazily on first view. Each call logs token cost to ai_model_usage.
**Specification:**
```gherkin
Given A run inserting 40 new jobs with descriptions
When  formatAndStoreNewJobs runs
Then  Only the first 25 are formatted this run; cost per call = tokensIn*(0.8/1e6) + tokensOut*(4/1e6) rounded to 6dp, logged as task_type='jd_formatting'
```
**Parameters:** JD_FORMAT_MAX_PER_RUN=25; JD_FORMAT_MODEL_NAME='Claude 3.5 Haiku'; rates $0.80/$4.00 per 1M tokens (mirror getModelPricing); failures are best-effort skipped
**Edge cases handled:**
- JD formatting cost is logged to ai_model_usage and therefore counts against the $75 cap, but it is not cost-gated before the call (best-effort).
**Confidence:** High — Cap constant, model, and pricing formula explicit.

### RULE-079: Submission worker batch size and scan window
**Category:** Policy
**Priority:** P2
**Source:** `supabase/functions/submission-worker/index.ts:55-76,255-290`  ·  **BR:** BR-130
**Plain English:** Each worker tick claims at most batchSize approved rows (default 10), but scans up to 4x that many so unclaimable rows (paused/no-credit/cap) at the front of the queue don't starve newer claimable rows. Rows are processed oldest-first and strictly sequentially.
**Specification:**
```gherkin
Given A queue of 50 approved rows, 25 of them unclaimable, with default config
When  runLive scans
Then  Scans up to 40 rows (10*4), claims and processes up to 10 claimable rows, then stops; remaining rows wait for the next tick
```
**Parameters:** DEFAULT_BATCH_SIZE=10; SUBMISSION_BATCH_SIZE env override (must be finite > 0); SCAN_MULTIPLIER=4; order = created_at ascending; processing is sequential (no parallelism, per BR-136 accounting)
**Edge cases handled:**
- If more than 40 rows are unclaimable at the front, claimable rows beyond the scan window are not reached this tick.
**Confidence:** High — Constants and loop bounds are explicit.

### RULE-080: Unknown chat-model fallback to general_qa default
**Category:** Policy
**Priority:** P2
**Source:** `src/lib/ai-router.ts:195-254`  ·  **BR:** BR-120, BR-124
**Plain English:** A user-selected chat model is honored only if it exists in CHAT_MODEL_CATALOG; any unknown name falls back to the general_qa default (Claude Sonnet 4.6) and is never forwarded to a provider.
**Specification:**
```gherkin
Given A chat request specifying model 'Made-Up Model 9'
When  resolveChatModel runs
Then  Returns the default { modelName: 'Claude Sonnet 4.6', provider: 'anthropic' } — the unknown name is dropped, not sent
```
**Parameters:** DEFAULT_CHAT_MODEL_NAME = general_qa routing entry = 'Claude Sonnet 4.6' (anthropic); catalog = Sonnet 4.6, Opus 4.6, GPT-5, GPT-4o, Gemini 2.5 Pro
**Edge cases handled:**
- Selecting a catalog model whose provider key is not configured is greyed out in the UI (BR-125), but resolveChatModel itself does not check key presence.
**Confidence:** High — Resolution logic and catalog are explicit.


---

## Rules requiring SME confirmation

- **RULE-074 (Medium, Prospector cron frequency, activation, and per-profile isolation)** — Where is the pg_cron schedule for prospector-cron defined and verified to be exactly twice daily, and is there any guard preventing a manual re-invocation (or a duplicate cron) from exceeding the BR-100 twice-per-24h cap, given the function itself does not check last_run_at before running?

### P0 rules carrying a suspected defect (preserve-vs-fix decision required in the Brief)

- **RULE-001 — AI monthly cost hard cap and warning ladder**: BR-053 says stage transitions are never blocked, but no task type maps a stage-transition AI call to isCritical=true (only email_classification is critical). If any stage transition relied on a non-critical AI task it could be blocked at the cap, contradicting BR-053.
- **RULE-003 — Heuristic job-fit scoring weights and targets (fallback)**: Heuristic recalibration lowered targets to un-starve the funnel; combined with the 5-pt location baseline and domain target=1, weak JDs can now reach 60+ (Consideration) on thin keyword overlap, inflating the review queue.
- **RULE-006 — Submission credit charge / refund accounting**: Stuck-expiry refunds a credit and marks the row 'failed' even though the application may have submitted externally; this can under-count consumed budget and leaves a real submission untracked until manual reconciliation.
- **RULE-025 — gmail-sync has NO auth gate; only a 60-second re-invocation time guard**: Deployed --no-verify-jwt with no auth gate. The 60s guard limits frequency but not access; an attacker can spend Gemini quota and drive autonomous stage transitions. Should adopt the CRON_SECRET pattern.
- **RULE-031 — prospector-cron has NO auth gate (publicly invokable, deployed --no-verify-jwt)**: Deployed --no-verify-jwt with no auth gate — a public, unauthenticated endpoint that burns paid SerpApi/Anthropic quota and runs service-role processing for all users. Should reuse submission-worker's isCronAuthorized()/CRON_SECRET pattern.
- **RULE-062 — Anthropic model display-name to API id mapping (silent swap)**: Pinned name 'Claude Opus 4.6' silently resolves to API id 'claude-opus-4-8' — the model actually billed/invoked differs from the routed/pinned/logged name. Cost is logged against the 4.6 rate while a different model serves the request, breaking the price-accuracy assumption of BR-054 and the model-pinning contract.
- **RULE-066 — Live submission worker must have CRON_SECRET (fail closed)**: Sibling Edge Functions prospector-cron and gmail-sync are also --no-verify-jwt but (unlike submission-worker) have NO CRON_SECRET gate at all, so those autonomous-write endpoints are publicly invokable.
