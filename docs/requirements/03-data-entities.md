# Data Entities

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## 14 Core Entities

### E-001 — users

Primary identity record for authenticated users.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key, from Supabase Auth |
| email | text | JB's login email |
| full_name | text | |
| avatar_url | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**RLS:** User can only read/write own row.

---

### E-002 — roles

Role assignments for access control.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| role | text | 'admin', 'applicant', 'ai_operator' |
| granted_at | timestamptz | |

**RLS:** User can only read own role rows.

---

### E-003 — companies

Employer records sourced from job listings.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| name | text | |
| domain | text | |
| industry | text | |
| size_range | text | |
| linkedin_url | text | |
| notes | text | |
| created_at | timestamptz | |

**RLS:** Readable by authenticated user; no user_id scoping (shared lookup table).

---

### E-004 — jobs

Individual job listing records.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| company_id | uuid | FK → companies.id |
| title | text | |
| location | text | |
| remote_type | text | 'remote', 'hybrid', 'onsite' |
| compensation_min | integer | Annual USD |
| compensation_max | integer | Annual USD |
| description | text | |
| skills | text[] | Extracted skill tags |
| source | text | Feed/API source identifier |
| source_url | text | Unique constraint |
| application_method | text | 'api', 'manual', 'ats' |
| posted_at | timestamptz | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-005 — recruiters

Recruiter contact records associated with jobs.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| company_id | uuid | FK → companies.id |
| name | text | |
| email | text | |
| linkedin_url | text | |
| notes | text | |
| created_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-006 — applications

Core pipeline record. One per job per user.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| job_id | uuid | FK → jobs.id |
| stage | text | PipelineStage enum |
| match_score | integer | 0–100 from ai_scores |
| submitted_at | timestamptz | Null until submitted |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**RLS:** user_id scoped.
**Constraint:** stage transitions must comply with `stageRules.ts` and write to `application_events`.

---

### E-007 — application_materials

Join table linking applications to documents (resume variants, cover letters).

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| application_id | uuid | FK → applications.id |
| document_id | uuid | FK → documents.id (see E-008) |
| material_type | text | 'resume', 'cover_letter', 'attachment' |
| is_primary | boolean | |
| linked_at | timestamptz | After linking, document is immutable |

**RLS:** via application → user_id.

---

### E-008 — documents

Immutable document versions stored in Supabase Storage.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| storage_path | text | Supabase Storage path |
| document_type | text | 'resume', 'cover_letter' |
| version | integer | Auto-increment per user per type |
| content_hash | text | SHA-256 of file content |
| is_locked | boolean | True after linked to application |
| created_at | timestamptz | |

**RLS:** user_id scoped. `is_locked = true` rows are immutable.

---

### E-009 — ai_scores

AI scoring results per job per scoring run.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| job_id | uuid | FK → jobs.id |
| overall_score | integer | 0–100 |
| skills_score | integer | |
| domain_score | integer | |
| seniority_score | integer | |
| tools_score | integer | |
| location_auth_score | integer | |
| recommendation | text | 'apply', 'consider', 'reject' |
| strengths | text[] | |
| gaps | text[] | |
| model_used | text | Model identifier |
| reasoning_trace | jsonb | Full chain-of-thought |
| scored_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-010 — application_events

Immutable event log. The system of record for all state changes.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| application_id | uuid | FK → applications.id |
| event_type | text | 'stage_transition', 'score_override', 'approval', 'rejection', etc. |
| from_stage | text | PipelineStage or null |
| to_stage | text | PipelineStage or null |
| actor | text | 'system', 'jb_manual', 'gmail_scraper', 'calendar_scraper', model id |
| reason | text | |
| metadata | jsonb | Arbitrary event context |
| created_at | timestamptz | |

**RLS:** user_id scoped. **No DELETE policy.**

---

### E-011 — emails

Parsed and classified email records from Gmail.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| application_id | uuid | FK → applications.id, nullable |
| gmail_message_id | text | Unique |
| from_address | text | |
| subject | text | |
| body_snippet | text | |
| classification | text | 'interview_invite', 'rejection', 'offer', 'outreach', 'follow_up', 'unknown' |
| confidence | float | 0.0–1.0 |
| auto_actioned | boolean | True if confidence >= 0.70 and action taken |
| received_at | timestamptz | |
| processed_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-012 — interviews

Scheduled interview records linked to applications.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| application_id | uuid | FK → applications.id |
| calendar_event_id | text | Google Calendar event ID |
| interview_type | text | 'phone', 'video', 'onsite', 'panel' |
| scheduled_at | timestamptz | |
| duration_minutes | integer | |
| location_or_link | text | |
| interviewer_names | text[] | |
| status | text | 'scheduled', 'complete', 'cancelled', 'rescheduled' |
| notes | text | |
| created_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-013 — notifications

In-app notification queue for JB.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| application_id | uuid | FK → applications.id, nullable |
| notification_type | text | 'approval_needed', 'stage_change', 'ai_signal', 'cost_alert' |
| title | text | |
| body | text | |
| is_read | boolean | |
| created_at | timestamptz | |

**RLS:** user_id scoped.

---

### E-014 — ai_model_usage

Token and cost tracking per AI API call.

| Field | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users.id |
| model_provider | text | 'openai', 'anthropic', 'google' |
| model_name | text | e.g., 'claude-opus-4-6', 'gpt-5' |
| task_type | text | e.g., 'cover_letter', 'match_scoring' |
| tokens_in | integer | |
| tokens_out | integer | |
| estimated_cost_usd | numeric(10,6) | |
| application_id | uuid | FK → applications.id, nullable |
| called_at | timestamptz | |

**RLS:** user_id scoped.
**Policy:** Monthly aggregate must not exceed $75.00 (SIGN-OFF-001).

---

## Entity Relationship Summary

```text
users ──< roles
users ──< jobs ──> companies
users ──< applications ──> jobs
applications ──< application_materials ──> documents
applications ──< application_events
applications ──< emails
applications ──< interviews
applications ──< notifications
jobs ──< ai_scores
users ──< recruiters ──> companies
users ──< ai_model_usage
users ──< documents
```
