# User Stories

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## Persona: JB — Power Applicant

### US-001 — Job Ingestion from Approved Sources

**As** JB,
**I want** the system to automatically ingest job listings from approved APIs and RSS feeds,
**so that** I have a continuously updated pool of job candidates without manual searching.

**Acceptance Criteria:**

- AC-001-01: System ingests from all MVP-approved sources (see [04-integrations.md](04-integrations.md))
- AC-001-02: Each job record captures: title, company, location, compensation, description, skills, source URL, application method
- AC-001-03: Duplicate jobs by source URL are deduplicated before insert
- AC-001-04: All ingested jobs default to `discovery` stage

---

### US-002 — CSV Job Import

**As** JB,
**I want** to upload a CSV of job listings,
**so that** I can add jobs from sources not covered by automated feeds.

**Acceptance Criteria:**

- AC-002-01: System accepts CSV with minimum columns: title, company, url
- AC-002-02: Imported jobs are validated and errors reported per row
- AC-002-03: Successfully imported jobs appear in pipeline at `discovery` stage

---

### US-003 — AI Match Scoring

**As** JB,
**I want** every job to receive an AI match score (0–100) against my profile,
**so that** I can prioritize applications and avoid wasting time on poor fits.

**Acceptance Criteria:**

- AC-003-01: Score is 0–100 with breakdown: skills, domain, seniority, tools, location/authorization
- AC-003-02: **match_score >= 60** routes job to Consideration / manual review pipeline (SIGN-OFF-005)
- AC-003-03: **match_score >= 80** routes job to Auto-Submit preparation gate (SIGN-OFF-005)
- AC-003-04: match_score < 60 results in `Reject` recommendation; job stays in `discovery` without promotion
- AC-003-05: Score rationale stored in `ai_scores` table with model and timestamp
- AC-003-06: Score can be manually overridden by JB with reason logged in `application_events`

---

### US-004 — Pipeline Stage Visibility

**As** JB,
**I want** to see all my applications organized by pipeline stage,
**so that** I always know where each opportunity stands.

**Acceptance Criteria:**

- AC-004-01: Dashboard displays counts per stage: discovery, applied, screening, interview_scheduled, interview_complete, offer, hired, rejected, ghosted
- AC-004-02: Stage changes are visible in real time via Supabase Realtime
- AC-004-03: Each application card shows: company, title, match_score, days in current stage, last event

---

### US-005 — Manual Stage Override

**As** JB,
**I want** to manually move any application to any valid next stage,
**so that** I can correct errors or handle edge cases the automation misses.

**Acceptance Criteria:**

- AC-005-01: Manual overrides require a reason string
- AC-005-02: Every manual override writes an `application_events` row with actor = 'jb_manual'
- AC-005-03: Rejection email signal does NOT auto-overwrite an existing `offer` stage (manual confirm required)

---

### US-006 — User-in-the-Loop Submission Gate

**As** JB,
**I want** the system to prepare a full application packet for my review and require my explicit approval before submitting,
**so that** I maintain control over every submission.

**Acceptance Criteria:**

- AC-006-01: For match_score >= 80, system prepares: tailored resume version, cover letter, pre-filled form data
- AC-006-02: JB sees preview of packet before any submission action
- AC-006-03: Submission does NOT proceed without JB explicit approval (click/confirm)
- AC-006-04: Approval action writes an `application_events` row with actor and timestamp
- AC-006-05: Stagehand autonomous submission is NOT active in MVP (SIGN-OFF-004)

---

### US-007 — Resume Generation

**As** JB,
**I want** the AI to generate a tailored resume variant for each application,
**so that** I can maximize ATS relevance without manual editing.

**Acceptance Criteria:**

- AC-007-01: Resume variant is based on JB's master profile and job description
- AC-007-02: Generated variant is stored in Supabase Storage and linked to the application
- AC-007-03: Documents are immutable after being linked to a submitted application
- AC-007-04: PDF export is available for any resume version

---

### US-008 — Cover Letter Generation

**As** JB,
**I want** a tailored cover letter generated for each application,
**so that** each submission feels personalized without requiring manual writing.

**Acceptance Criteria:**

- AC-008-01: Cover letter references specific job requirements and JB's relevant experience
- AC-008-02: Cover letter version is linked to application record
- AC-008-03: JB can regenerate or manually edit before approval
- AC-008-04: Final approved version is immutable

---

### US-009 — Gmail Recruiter Signal Processing

**As** JB,
**I want** the system to automatically classify incoming emails related to my applications,
**so that** stage transitions happen without manual email monitoring.

**Acceptance Criteria:**

- AC-009-01: System classifies emails as: interview_invite, rejection, offer, outreach, follow_up
- AC-009-02: Classification confidence < 0.70 → email stored but NOT auto-actioned
- AC-009-03: Confidence >= 0.70 → auto-transition to appropriate stage with `application_events` row
- AC-009-04: JB is notified of all classified emails
- AC-009-05: OAuth 2.0 scopes are read-only; no email sending without explicit JB action

---

### US-010 — Calendar Interview Detection

**As** JB,
**I want** the system to detect interview calendar events and update my pipeline automatically,
**so that** I don't need to manually update stage after scheduling.

**Acceptance Criteria:**

- AC-010-01: System detects Google Calendar events linked to known companies/recruiters
- AC-010-02: Matched events trigger transition to `interview_scheduled`
- AC-010-03: Event details (date, time, link) are stored on the application record
- AC-010-04: Post-event date passes → system prompts JB to confirm `interview_complete`

---

### US-011 — Real-Time Dashboard

**As** JB,
**I want** a live dashboard showing my application pipeline metrics,
**so that** I can make real-time decisions on where to focus.

**Acceptance Criteria:**

- AC-011-01: Dashboard loads in < 2 seconds
- AC-011-02: Metrics update in real time via Supabase Realtime (no manual refresh required)
- AC-011-03: Displays: applications this week, active interviews, pending approvals, AI confidence average, rejection count

---

### US-012 — Audit Log Access

**As** JB,
**I want** to browse the complete history of every action taken on every application,
**so that** I have full transparency and can investigate any discrepancy.

**Acceptance Criteria:**

- AC-012-01: All `application_events` rows are displayed in chronological order
- AC-012-02: Events are never deletable from UI or API
- AC-012-03: Each event shows: timestamp, actor, from_stage, to_stage, reason, model used (if AI)

---

### US-013 — AI Chat Assistant

**As** JB,
**I want** to chat with an AI assistant about my job search strategy,
**so that** I can get intelligent advice without leaving the platform.

**Acceptance Criteria:**

- AC-013-01: Chat responds with context from JB's current pipeline state and match scores
- AC-013-02: Assistant can draft follow-up emails, explain scores, and suggest filters
- AC-013-03: Chat is routed to correct model per task type (see [05-ai-routing.md](05-ai-routing.md))

---

### US-014 — AI Cost Monitoring

**As** JB,
**I want** the system to enforce a hard cap of $75/month on all AI model usage,
**so that** my operational costs stay predictable and within budget.

**Acceptance Criteria:**

- AC-014-01: All AI API calls log tokens consumed and estimated cost to `ai_model_usage` table
- AC-014-02: Monthly cost is tracked per provider and per model
- AC-014-03: When projected monthly cost reaches 90% of $75 cap, system alerts JB
- AC-014-04: When hard cap is reached ($75), non-critical AI calls are queued/blocked; critical pipeline transitions are never blocked
- AC-014-05: JB can view current month spend broken down by model and task type

---

### US-015 — External Platform Account Policy

**As** JB,
**I want** the system to ask me before creating or configuring accounts on any external platform,
**so that** I maintain control over my professional identity and credentials.

**Acceptance Criteria:**

- AC-015-01: System MUST query JB for explicit approval before any external account creation or configuration
- AC-015-02: Preferred account email for all platform registrations: [john@bktadvisory.com](mailto:john@bktadvisory.com) (SIGN-OFF-003)
- AC-015-03: No credentials or account details are stored outside of JB-approved, encrypted secret storage
- AC-015-04: Any automated action that would initiate an external account is blocked pending JB confirmation
