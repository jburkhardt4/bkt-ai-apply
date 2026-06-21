# **Product Requirements Document (PRD)**

## **BKT AI-Apply**

AI-Orchestrated Job Application Automation & Pipeline Management Platform

---

## 1. Product Vision

**BKT AI-Apply** is an AI-orchestrated, compliance-first, event-driven job application automation platform built on React + Supabase that enables John Burkhardt to apply to 800+ qualified jobs per month across compliant job sources while maintaining full visibility, auditability, and human-in-the-loop control.

The system functions as:

* A structured job pipeline manager
* An AI-assisted resume & cover letter engine
* A job-fit scoring and RAG analysis platform
* A compliant auto-apply orchestration system
* A recruiter/interview email intelligence processor
* A centralized operational dashboard

---

## 2. Business Requirements (BABOK – Business Level)

## 2.1 Business Objectives

1. Enable 800 applications per month (≈ 200/week).
2. Maintain ≥ 80% AI job-fit score threshold for submission (BR-008).
3. Reduce manual effort per application to < 2 minutes average.
4. Achieve ≥ 3–8% interview conversion rate.
5. Ensure 100% action auditability and compliance.

## 2.2 Success Metrics (KPIs)

| Category    | Metric                      | Target         |
| ----------- | --------------------------- | -------------- |
| Volume      | Applications/month          | ≥ 800          |
| Efficiency  | Avg. time per application   | < 2 min        |
| AI Quality  | Job-match accuracy feedback | ≥ 75% positive |
| Pipeline    | Interview rate              | ≥ 5%           |
| Reliability | Automation failure rate     | < 2%           |
| Compliance  | Logged action coverage      | 100%           |

---

## 3. Stakeholder Requirements

## Primary Stakeholder

* **John Burkhardt (JB)** – Power user, automation strategist

## Secondary Stakeholders

* AI engineers
* Frontend engineers
* Supabase backend engineers
* Legal/compliance reviewers
* Potential future enterprise users

### Stakeholder Needs

| Stakeholder | Need                                           |
| ----------- | ---------------------------------------------- |
| JB          | Apply at scale with strategic precision        |
| Engineers   | Deterministic workflows + clear API boundaries |
| Legal       | Compliant integrations only                    |
| Product     | Modular AI architecture                        |

---

## 4. User Personas

## Persona 1 – Power Applicant (Primary)

* Applies to 800+ jobs monthly
* Requires automation + oversight
* Needs structured pipeline visibility

## Persona 2 – Recruiter Intelligence Monitor

* Tracks recruiter engagement
* Analyzes response patterns

## Persona 3 – AI Operations Engineer

* Configures model routing
* Tunes scoring thresholds

---

## 5. User Requirements

Users must be able to:

1. Connect Gmail & Google Calendar securely.
2. Import jobs from compliant sources.
3. View structured job metadata.
4. Receive AI-generated match scores.
5. Approve or reject application submissions.
6. Track job status lifecycle.
7. Generate tailored resumes and cover letters.
8. Monitor interviews and recruiter responses.
9. View real-time dashboard updates.
10. Access full audit logs.

---

## 6. Functional Requirements

## 6.1 Job Discovery

* System shall ingest job listings from:

  * Official APIs
  * RSS feeds
  * Partner integrations
  * User-uploaded CSV
  * Browser-assisted workflows
* System shall extract structured fields:

  * Title
  * Company
  * Location
  * Compensation (if available)
  * Job description
  * Skills
  * Source URL
  * Application method

---

## 6.2 Job Match Scoring

* RAG-based analysis against:

  * Resume
  * Skill profile
  * Work history
  * Stated preferences
* Score range: 0–100
* Score breakdown:

  * Skill alignment
  * Experience depth
  * Industry fit
  * Seniority match
* Recommendation:

  * Apply
  * Consider
  * Reject

---

## 6.3 Auto-Apply Workflow (Compliant)

System shall:

1. Identify eligible jobs (match_score ≥ 60 → Consideration; match_score ≥ 80 → Auto-Submit prep).
2. Generate tailored resume and cover letter.
3. Prepare application packet.
4. Submit via three autonomy modes controlled by `user_settings.review_mode` (ADR-006):
   * `review` — explicit JB approval required per application
   * `assist` — scores ≥ threshold auto-queue as approved; JB reviews queue
   * `auto` — scores ≥ threshold submit autonomously within server-enforced guardrails
5. Log submission metadata and write `application_events` row on every stage transition.
6. Record timestamp + source confirmation.

System shall NOT:

* Bypass CAPTCHA
* Circumvent anti-bot systems
* Evade rate limits
* Circumvent login security

---

## 6.4 Resume & Cover Letter Engine

* Template-based resume variants
* AI personalization layer
* Version tracking
* Export to PDF
* Store in Supabase Storage
* Maintain material-job relationship mapping

---

## 6.5 Gmail Parsing

System shall detect:

* Interview invitations
* Rejection emails
* Recruiter outreach
* Follow-up requests

Using:

* Gmail API
* Structured label creation
* NLP classification

Triggers:

* Update job status
* Create calendar event
* Generate draft response

---

## 6.6 Google Calendar Parsing

System shall:

* Detect interview events
* Link to job record
* Update status to “Interview Scheduled”
* Trigger reminders

---

## 6.7 Dashboard

Real-time metrics:

* Applications this week
* Interviews
* Rejections
* Pending approvals
* AI confidence averages

---

## 6.8 AI Chatbot Assistant

Capabilities:

* Suggest job filters
* Explain match scores
* Draft follow-ups
* Analyze rejection patterns
* Suggest optimization strategies

---

## 7. Nonfunctional Requirements

| Category        | Requirement              |
| --------------- | ------------------------ |
| Performance     | < 2 sec UI load          |
| Scalability     | 1,000 jobs/month         |
| Availability    | 99.5%                    |
| Observability   | Full structured logs     |
| Reliability     | Idempotent workflows     |
| Maintainability | Modular AI adapter layer |

---

## 8. Technical Requirements

## Frontend

* React (Vite + TypeScript)
* Supabase client SDK
* Realtime subscriptions
* Zustand or Redux state layer
* Role-based route guards

## Backend

* Supabase PostgreSQL
* Supabase Edge Functions (TypeScript)
* Event-driven webhook architecture
* Row-Level Security (RLS)
* Background queue processing

---

## 9. High-Level Architecture

```text
React Frontend
   ↓ (Supabase client)
Supabase Postgres (Single Source of Truth)
   ↓
Realtime Subscriptions
   ↓
Edge Functions (Event-driven)
   ↓
AI Model Router
   ↓
External APIs (Gmail, Calendar, Job Boards)
```

---

## 10. Database Entity Requirements

Core Entities:

* Users
* Roles
* Jobs
* Companies
* Recruiters
* Applications
* Application_Materials
* AI_Scores
* Workflow_Events
* Emails
* Interviews
* Notifications
* Audit_Logs
* AI_Model_Usage

Relationships:

* Job → Company (Many-to-One)
* Application → Job (One-to-One)
* Application → Materials (Many-to-Many)
* Job → AI_Score (One-to-One)
* Workflow_Event → Application (Many-to-One)

---

## 11. Realtime Sync Requirements

Realtime triggers for:

* Job score update
* Application status change
* Interview detection
* New recruiter message
* AI job recommendation

Frontend auto-refresh without polling.

---

## 12. Automation Workflow Requirements

* Event-based triggers
* Deterministic state transitions
* Retry logic with exponential backoff
* Dead-letter queue for failures
* Manual override capability

---

## 13. AI Agent Orchestration Requirements

## Model Providers

* Anthropic (Claude Opus 4.6, Claude Sonnet 4.6)
* OpenAI (GPT-5)
* Google (Gemini 2.5 Pro, Gemini 2.5 Flash)

See `docs/conventions/model-routing.md` for the pinned routing matrix.

## Router Modes

* Automatic task-type-based routing (primary)
* User-selectable chat model (JB manual override)
* Cost-optimized fallback routing at $75/month cap (BR-050)

## Agent Types

* Resume Optimizer
* Job Matcher
* Email Draft Agent
* Interview Prep Agent
* Pipeline Strategy Agent

---

## 14. RAG Pipeline Requirements

Data Sources:

* Resume documents
* Work history database
* Past application outcomes
* Recruiter responses

Process:

1. Embed documents
2. Store vectors
3. Retrieve relevant context
4. Generate analysis
5. Store reasoning trace

---

## 15. Security Requirements

* OAuth 2.0 for Gmail/Calendar
* Supabase RLS enforcement
* Encrypted storage for files
* Encrypted secrets storage
* Full audit logging
* Rate limiting on Edge Functions
* Role-based access control

---

## 16. Privacy & Compliance Requirements

* GDPR-aligned data deletion
* User-controlled data purge
* Data minimization principle
* No scraping behind authentication walls without API
* Explicit disclosure of automation actions
* Transparent logging

---

## 17. Integration Requirements

* Gmail API
* Google Calendar API
* SerpApi / Google Jobs (job discovery — prospector-cron)
* LinkedIn (approved APIs only)
* Workday (approved integrations only)
* Greenhouse API
* Ashby API
* Indeed partner feeds (where permitted)

> **Note:** ZipRecruiter removed from MVP integration set (SIGN-OFF-002).

---

## 18. Operational Requirements

* CI/CD pipeline
* Automated testing
* Staging environment
* Feature flags
* Observability (Sentry/Logs)
* Backup strategy
* Database migration control

---

## 19. Analytics & Reporting Requirements

Reports:

* Conversion rate by job board
* Interview rate by industry
* AI-score vs outcome correlation
* Response time analysis
* Rejection keyword analysis

Export:

* CSV
* Dashboard charts
* Weekly summary digest

---

## 20. Risk, Limitation & Ethical Requirements

Risks:

* Job board API restrictions
* Over-automation reducing personalization
* AI hallucinations
* Data leakage

Mitigations:

* Human approval loop
* Confidence thresholds
* Explainable scoring
* Full transparency logs

Ethical Boundaries:

* No misrepresentation
* No falsified experience
* No deceptive automation
* Clear compliance-first strategy

---

## 21. Permission & Role Requirements

Roles:

* Admin
* Applicant (JB)
* AI Operator (future)

Permissions:

* Submit application
* Override score
* Edit templates
* View logs
* Configure AI routing

---

## 22. MVP Scope

Includes:

* Job ingestion (API + manual upload)
* RAG job scoring (match_score 0–100; ≥ 60 Consideration; ≥ 80 Auto-Submit prep — SIGN-OFF-005)
* Automated Job Prospector — background cron discovery pipeline (F-017)
* Resume and cover letter generation
* Gmail intelligence (email classification + stage transitions)
* Calendar intelligence (interview detection)
* Submission workflow with three autonomy modes: review / assist / auto (ADR-006)
* Real-time dashboard
* Audit logging

Excludes:

* Multi-user SaaS
* Advanced analytics
* Enterprise billing
* Browser automation via Stagehand for ATS form fill (Post-MVP — SIGN-OFF-004 partially superseded by ADR-006; browser channel exists but full Stagehand form automation is Post-MVP)

---

## 23. Post-MVP Roadmap

* Multi-user SaaS version
* Advanced recruiter intelligence scoring
* Interview performance analytics
* Auto-follow-up scheduling
* AI career strategy modeling
* Chrome browser-assist extension

---

## 24. Primary User Journeys

### Journey 1 – Auto-Apply

1. Jobs imported
2. AI scores job
3. System recommends apply
4. Resume generated
5. User approves
6. Submission logged
7. Status updated

---

### Journey 2 – Interview Detection

1. Gmail detects invite
2. Classifier labels interview
3. Calendar event created
4. Job status updated
5. AI generates preparation notes

---

## 25. Error Handling Requirements

* All failures logged
* Retry queue
* User notification on critical failure
* Manual retry button
* Error classification system

---

## 26. Acceptance Criteria (Sample)

| Feature     | Acceptance Criteria                     |
| ----------- | --------------------------------------- |
| Job Score   | Returns score + breakdown + explanation |
| Resume Gen  | Generates PDF stored in Supabase        |
| Gmail Parse | Correctly classifies 90% of test emails |
| Realtime    | UI updates within 1 sec of DB change    |
| Submission  | Logged with timestamp + job ID          |

---

## 27. F-017 Epic — Automated Job Prospector

> **Status: Implemented.** Migration `20260607000001_add_prospecting_tables.sql` applied.
> UI implemented in `src/features/jobs/` and `src/pages/ProspectorPage.tsx`.
> Full spec: `docs/features/prospector-schema-proposal.md`, `docs/features/prospector-ui-spec.md`.

## Feature Definition and Goals

The Automated Job Prospector is an autonomous background pipeline that discovers, scrapes, scores, and queues job openings without requiring manual ingestion. It operates against a saved configuration profile owned by JB, runs on a scheduled cron cadence, and surfaces matched jobs in a "Ready to Apply" queue inside the application pipeline.

Goals:

* Eliminate manual job search by continuously sourcing leads from approved channels
* Surface only high-signal matches (score >= 60, per BR-020) to JB's active queue
* Operate within the existing $75/month AI cost ceiling (BR-050, BR-051, BR-052, BR-053)
* Maintain full auditability via the `prospecting_runs` log table

---

## Configuration Parameters

Each user maintains a single `prospecting_profiles` record that governs the prospector's search behavior.

| Parameter | Type | Constraints | Required |
| --- | --- | --- | --- |
| `job_title` | text | Non-empty string | Yes |
| `location` | text | Free-form string | No |
| `job_type` | enum | `full-time`, `contract`, `part-time` | Yes |
| `environment` | enum | `remote`, `hybrid`, `in-office` | Yes |
| `salary_min` | integer | Must be ≤ `salary_max` when both are provided; ≥ 0 | No |
| `salary_max` | integer | Must be ≥ `salary_min` when both are provided; ≥ 0 | No |
| `skills` | text[] | Maximum 20 tags; each tag ≤ 50 characters | No |
| `is_active` | boolean | `false` by default; toggling to `true` enables cron; toggling to `false` halts cron immediately (BR-107) | Yes |

---

## Execution Frequency and Cost Ceiling

The prospector cron runs at most **twice per 24-hour period** per active profile (BR-100). Extra cron triggers within the same period are treated as no-ops.

AI scoring during prospector runs uses the `match_scoring` task type, routed to Claude Opus 4.6 via `src/lib/ai-router.ts` (per model-routing.md). All scoring calls log to `ai_model_usage` and count against the $75/month cap (BR-050). When the cap is reached, prospector scoring runs are queued rather than cancelled (BR-104); critical pipeline operations are never blocked (BR-053).

Cost ceiling enforcement summary:

* BR-050: $75/month hard cap across all providers
* BR-051: At 90% of cap ($67.50), JB notification is sent
* BR-052: At hard cap, non-critical AI calls are blocked/queued
* BR-053: Critical pipeline calls are never blocked
* BR-104: Prospector scoring queued (not cancelled) when cap is reached

---

## Workflow

```text
Cron trigger (twice daily, every 12 hours, while is_active = true)
  ↓
Read prospecting_profiles for this user (user_id = auth.uid())
  ↓
Scrape / ingest job listings from approved sources using profile parameters
  ↓
Deduplicate by source_url (BR-102, BR-063) — silently skip duplicates
  ↓
Insert new jobs into jobs table with source = 'prospector'
  ↓
AI scoring pipeline (match_scoring task type → Claude Opus 4.6 via ai-router.ts)
  - Stage transitions from prospector go through public.transition_stage RPC (BR-004, LSN-004)
  - Score stored in ai_scores with reasoning_trace (BR-103, AI-RULE-009)
  ↓
Jobs with match_score >= 60 (BR-020, BR-105) surface in "Ready to Apply" queue
Jobs with match_score < 60 stay in discovery stage with Reject recommendation (BR-022)
  ↓
Prospecting run logged to prospecting_runs (id, profile_id, user_id, run_at, jobs_found, jobs_queued, status)
  - If zero results: status = 'empty', jobs_found = 0, no error raised (BR-106)
```

---

## Acceptance Criteria

### US-016 — Prospector Profile Configuration

**As** JB,
**I want** to save a search configuration profile for the prospector,
**so that** the system knows what kinds of jobs to search for on my behalf.

* AC-016-01: JB can create or update a single prospecting profile with all configuration parameters
* AC-016-02: Profile validates that `salary_min` ≤ `salary_max` when both fields are populated
* AC-016-03: `skills` array is limited to 20 tags; tags exceeding this limit are rejected with an error message
* AC-016-04: Profile is scoped to `user_id = auth.uid()` and is not visible to or writable by any other user (BR-101, BR-001)
* AC-016-05: Profile save writes to `prospecting_profiles` via the single Supabase client (BR-004)

### US-017 — Prospector Enable/Disable Toggle

**As** JB,
**I want** to toggle the prospector on and off,
**so that** I can pause automated discovery without deleting my configuration.

* AC-017-01: Toggling `is_active = true` schedules cron-triggered runs at the configured frequency (BR-100)
* AC-017-02: Toggling `is_active = false` halts cron-triggered runs immediately; in-flight runs complete but no new runs are triggered (BR-107)
* AC-017-03: JB can still manually trigger a single prospector run when `is_active = false` (BR-107)
* AC-017-04: Toggle state change is reflected in the UI without a page refresh

### US-018 — Prospector Run and Queue

**As** JB,
**I want** the prospector to automatically find, score, and queue matching jobs,
**so that** I have a ready pool of high-fit leads without manual searching.

* AC-018-01: Prospector runs twice daily when `is_active = true` (BR-100)
* AC-018-02: Duplicate jobs by `source_url` are silently skipped — not inserted twice (BR-102, BR-063)
* AC-018-03: Empty run results (zero jobs found) are logged with `status = 'empty'` and no error is raised (BR-106)
* AC-018-04: AI scoring for prospector jobs uses `match_scoring` task type routed via `src/lib/ai-router.ts` (BR-103)
* AC-018-05: All AI scoring calls are logged to `ai_model_usage` and counted against the monthly cap (BR-050, BR-054)
* AC-018-06: When the $75/month cap is reached, prospector scoring runs are queued, not cancelled (BR-104)
* AC-018-07: Jobs with `match_score >= 60` are surfaced in the "Ready to Apply" queue (BR-105, BR-020)
* AC-018-08: Stage transitions triggered by the prospector pipeline go through the `public.transition_stage` RPC to ensure atomicity (LSN-004)
* AC-018-09: Each prospector run produces a `prospecting_runs` row with: `profile_id`, `user_id`, `run_at`, `jobs_found`, `jobs_queued`, `status`, and any `error` detail
* AC-018-10: "Last run" timestamp and "Next scheduled run" are visible on the Prospector dashboard

---

## 28. Open Questions

1. Which job boards provide official APIs at required scale?
2. What is acceptable daily submission limit?
3. ~~Should browser-assisted workflow be MVP?~~ — Resolved: ADR-006 implements browser channel via Browserbase + Stagehand; full form automation is Post-MVP.
4. ~~What is preferred AI cost ceiling per month?~~ — Resolved: $75/month hard cap (SIGN-OFF-001, BR-050).
5. Is enterprise SaaS a future strategic objective?

---

## 29. Assumptions

* JB is sole initial user.
* All integrations must be compliant.
* AI task routing is automatic (task-type → model) with JB-selectable override for the chat assistant.
* Supabase remains primary infrastructure.

---

## Conclusion

BKT AI-Apply is a compliant, AI-orchestrated, event-driven job application automation platform designed for high-volume, strategic, and measurable application execution. It leverages React + Supabase architecture with AI agent routing, RAG-based job scoring, and full audit transparency to enable 800+ monthly applications while maintaining governance and visibility.
