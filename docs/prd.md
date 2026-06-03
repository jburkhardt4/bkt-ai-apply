# **Product Requirements Document (PRD)**

## **BKT AI-Apply**

AI-Orchestrated Job Application Automation & Pipeline Management Platform

---

# 1. Product Vision

**BKT AI-Apply** is an AI-orchestrated, compliance-first, event-driven job application automation platform built on React + Supabase that enables John Burkhardt to apply to 800+ qualified jobs per month across compliant job sources while maintaining full visibility, auditability, and human-in-the-loop control.

The system functions as:

* A structured job pipeline manager
* An AI-assisted resume & cover letter engine
* A job-fit scoring and RAG analysis platform
* A compliant auto-apply orchestration system
* A recruiter/interview email intelligence processor
* A centralized operational dashboard

---

# 2. Business Requirements (BABOK – Business Level)

## 2.1 Business Objectives

1. Enable 800 applications per month (≈ 200/week).
2. Maintain ≥ 60% AI job-fit score threshold for submission.
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

# 3. Stakeholder Requirements

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

# 4. User Personas

### Persona 1 – Power Applicant (Primary)

* Applies to 800+ jobs monthly
* Requires automation + oversight
* Needs structured pipeline visibility

### Persona 2 – Recruiter Intelligence Monitor

* Tracks recruiter engagement
* Analyzes response patterns

### Persona 3 – AI Operations Engineer

* Configures model routing
* Tunes scoring thresholds

---

# 5. User Requirements

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

# 6. Functional Requirements

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

1. Identify eligible jobs.
2. Generate tailored materials.
3. Prepare application packet.
4. Flag readiness status.
5. Require explicit approval for submission where API not available.
6. Log submission metadata.
7. Record timestamp + source confirmation.

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

# 7. Nonfunctional Requirements

| Category        | Requirement              |
| --------------- | ------------------------ |
| Performance     | < 2 sec UI load          |
| Scalability     | 1,000 jobs/month         |
| Availability    | 99.5%                    |
| Observability   | Full structured logs     |
| Reliability     | Idempotent workflows     |
| Maintainability | Modular AI adapter layer |

---

# 8. Technical Requirements

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

# 9. High-Level Architecture

```
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

# 10. Database Entity Requirements

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

# 11. Realtime Sync Requirements

Realtime triggers for:

* Job score update
* Application status change
* Interview detection
* New recruiter message
* AI job recommendation

Frontend auto-refresh without polling.

---

# 12. Automation Workflow Requirements

* Event-based triggers
* Deterministic state transitions
* Retry logic with exponential backoff
* Dead-letter queue for failures
* Manual override capability

---

# 13. AI Agent Orchestration Requirements

## Model Providers

* OpenAI
* Claude
* Future plug-ins

## Router Modes

* Manual selection
* Automatic topic-based routing
* Cost-optimized routing

## Agent Types

* Resume Optimizer
* Job Matcher
* Email Draft Agent
* Interview Prep Agent
* Pipeline Strategy Agent

---

# 14. RAG Pipeline Requirements

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

# 15. Security Requirements

* OAuth 2.0 for Gmail/Calendar
* Supabase RLS enforcement
* Encrypted storage for files
* Encrypted secrets storage
* Full audit logging
* Rate limiting on Edge Functions
* Role-based access control

---

# 16. Privacy & Compliance Requirements

* GDPR-aligned data deletion
* User-controlled data purge
* Data minimization principle
* No scraping behind authentication walls without API
* Explicit disclosure of automation actions
* Transparent logging

---

# 17. Integration Requirements

* Gmail API
* Google Calendar API
* LinkedIn (approved APIs only)
* Workday (approved integrations only)
* Greenhouse API
* Ashby API
* ZipRecruiter API
* Indeed partner feeds (where permitted)

---

# 18. Operational Requirements

* CI/CD pipeline
* Automated testing
* Staging environment
* Feature flags
* Observability (Sentry/Logs)
* Backup strategy
* Database migration control

---

# 19. Analytics & Reporting Requirements

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

# 20. Risk, Limitation & Ethical Requirements

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

# 21. Permission & Role Requirements

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

# 22. MVP Scope

Includes:

* Job ingestion (API + manual upload)
* RAG job scoring
* Resume generation
* Gmail parsing
* Calendar parsing
* Manual approval submission workflow
* Dashboard
* Audit logging

Excludes:

* Multi-user SaaS
* Advanced analytics
* Enterprise billing

---

# 23. Post-MVP Roadmap

* Multi-user SaaS version
* Advanced recruiter intelligence scoring
* Interview performance analytics
* Auto-follow-up scheduling
* AI career strategy modeling
* Chrome browser-assist extension

---

# 24. Primary User Journeys

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

# 25. Error Handling Requirements

* All failures logged
* Retry queue
* User notification on critical failure
* Manual retry button
* Error classification system

---

# 26. Acceptance Criteria (Sample)

| Feature     | Acceptance Criteria                     |
| ----------- | --------------------------------------- |
| Job Score   | Returns score + breakdown + explanation |
| Resume Gen  | Generates PDF stored in Supabase        |
| Gmail Parse | Correctly classifies 90% of test emails |
| Realtime    | UI updates within 1 sec of DB change    |
| Submission  | Logged with timestamp + job ID          |

---

# 27. Open Questions

1. Which job boards provide official APIs at required scale?
2. What is acceptable daily submission limit?
3. Should browser-assisted workflow be MVP?
4. What is preferred AI cost ceiling per month?
5. Is enterprise SaaS a future strategic objective?

---

# 28. Assumptions

* JB is sole initial user.
* All integrations must be compliant.
* AI routing is configurable.
* Supabase remains primary infrastructure.

---

# Conclusion

BKT AI-Apply is a compliant, AI-orchestrated, event-driven job application automation platform designed for high-volume, strategic, and measurable application execution. It leverages React + Supabase architecture with AI agent routing, RAG-based job scoring, and full audit transparency to enable 800+ monthly applications while maintaining governance and visibility.
