# Feature Register

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## MVP Features

| ID | Feature | Description | Priority |
| --- | --- | --- | --- |
| F-001 | Job Ingestion | Ingest jobs from approved APIs, RSS feeds, and user CSV upload | P0 |
| F-002 | AI Match Scoring | RAG-based scoring (0–100) against JB's resume and preferences | P0 |
| F-003 | Pipeline State Machine | Event-sourced stage transitions with `application_events` audit trail | P0 |
| F-004 | UITL Submission Gate | Prepare application packet; require JB manual approval before submission | P0 |
| F-005 | Resume Engine | AI-personalized resume variants with version tracking and PDF export | P0 |
| F-006 | Cover Letter Engine | AI-generated cover letters linked to application version | P0 |
| F-007 | Gmail Intelligence | Classify recruiter emails (interview, rejection, offer, outreach) | P0 |
| F-008 | Calendar Intelligence | Detect interview events; auto-transition to `interview_scheduled` | P0 |
| F-009 | Real-Time Dashboard | Live metrics: applications, interviews, rejections, AI confidence | P0 |
| F-010 | Audit Log Viewer | Browse all `application_events` rows; never deletable | P0 |
| F-011 | AI Chat Assistant | Multi-model chat for job strategy, score explanation, drafts | P1 |
| F-012 | AI Cost Monitor | Track and enforce $75/month hard cap across all model providers | P0 |
| F-013 | Score Threshold Routing | match_score >= 60 → Consideration; match_score >= 80 → Auto-Submit prep | P0 |
| F-014 | Document Storage | Supabase Storage for resumes and cover letters; immutable after linking | P0 |
| F-015 | Notification System | In-app alerts for stage changes, approvals needed, AI signals | P1 |
| F-016 | Analytics Reports | Conversion rate by board, interview rate by industry, score vs outcome | P1 |
| F-017 | Automated Job Prospector | Autonomous background pipeline: saved search profile → cron scrape (twice daily) → AI scoring → Ready to Apply queue (match_score >= 60, BR-020) | P1 |

---

## Post-MVP Features

| ID | Feature | Description | Reason Deferred |
| --- | --- | --- | --- |
| F-POST-001 | Stagehand Browser Automation | Autonomous form fill and submission | SIGN-OFF-004 |
| F-POST-002 | ZipRecruiter Integration | Job ingestion via ZipRecruiter API | SIGN-OFF-002 |
| F-POST-003 | Multi-User / Enterprise Roles | Additional user roles beyond JB | Scope |
| F-POST-004 | Native Mobile App | iOS/Android companion | Scope |
| F-POST-005 | RAG Vector Store | Embedded past outcomes for retrieval | Complexity |

---

## Feature-to-Requirement Traceability

| Feature ID | User Story IDs | Business Rule IDs |
| --- | --- | --- |
| F-001 | US-001, US-002 | BR-001, BR-010 |
| F-002 | US-003 | BR-005, BR-006, BR-013 |
| F-003 | US-004, US-005 | BR-002, BR-003, BR-004, BR-091, BR-092 |
| F-004 | US-006 | BR-007, BR-008 |
| F-005 | US-007 | BR-009 |
| F-006 | US-008 | BR-009 |
| F-007 | US-009, US-010 | BR-011, BR-012 |
| F-008 | US-010 | BR-012 |
| F-009 | US-011 | BR-001 |
| F-010 | US-012 | BR-003, BR-090 |
| F-011 | US-013 | BR-014 |
| F-012 | US-014 | BR-015 |
| F-013 | US-003 | BR-005, BR-006 |
| F-017 | US-016, US-017, US-018 | BR-001, BR-004, BR-005, BR-020, BR-050, BR-051, BR-052, BR-053, BR-054, BR-063, BR-100, BR-101, BR-102, BR-103, BR-104, BR-105, BR-106, BR-107 |
