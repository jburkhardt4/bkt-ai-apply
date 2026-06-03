# Integrations

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## MVP Integration Set

| ID | Integration | Type | Source | Status |
| --- | --- | --- | --- | --- |
| INT-001 | Gmail API | OAuth 2.0 read-only | Google | MVP |
| INT-002 | Google Calendar API | OAuth 2.0 read-only | Google | MVP |
| INT-003 | LinkedIn Jobs | Approved API / partner feed only | LinkedIn | MVP |
| INT-004 | Greenhouse | Official ATS API | Greenhouse | MVP |
| INT-005 | Ashby | Official ATS API | Ashby | MVP |
| INT-006 | Indeed | Partner feed only (where permitted) | Indeed | MVP |
| INT-007 | Workday | Approved integrations only | Workday | MVP |
| INT-008 | RSS/Generic Feed | Standard RSS/Atom ingestion | Various | MVP |
| INT-009 | CSV Upload | User-supplied job list | JB manual | MVP |

---

## Removed from MVP

| ID | Integration | Removal Reason | Decision |
| --- | --- | --- | --- |
| INT-REMOVED-001 | ZipRecruiter | Removed from MVP scope | SIGN-OFF-002 |

ZipRecruiter may be reconsidered for Post-MVP pending API terms review.

---

## Deferred to Post-MVP

| ID | Integration | Reason |
| --- | --- | --- |
| INT-DEFERRED-001 | Stagehand Browser Automation | SIGN-OFF-004: UITL gate used in MVP instead |

---

## External Account Policy (SIGN-OFF-003)

> **Hard constraint:** The system MUST explicitly query JB for approval before attempting
> to create, configure, or register any external platform account.
>
> Preferred account email for all external registrations: **[john@bktadvisory.com](mailto:john@bktadvisory.com)**
>
> No automated credential creation or platform registration is permitted without explicit
> JB confirmation, regardless of automation capability.

This applies to:

- Job board account creation
- ATS API application registration
- OAuth app registration on any external platform
- Any service that would create a publicly visible account profile

---

## Integration Compliance Rules

| Rule ID | Rule |
| --- | --- |
| INT-RULE-001 | No scraping behind authentication walls without an approved API |
| INT-RULE-002 | No CAPTCHA bypass under any circumstances |
| INT-RULE-003 | No circumvention of rate limits; implement exponential backoff |
| INT-RULE-004 | No anti-bot system evasion |
| INT-RULE-005 | OAuth scopes must be minimal (read-only where possible) |
| INT-RULE-006 | All API keys and OAuth tokens stored in Supabase encrypted secrets; never in client bundle |
| INT-RULE-007 | Webhooks from external services must be HMAC-signed and verified by Edge Functions |

---

## Gmail Integration Specification

- **Scope required:** `gmail.readonly` (read-only; no send without explicit JB action)
- **Trigger:** Push notifications via Gmail API watch
- **Processing:** Edge Function classifies email with AI (confidence threshold 0.70)
- **Actions on confidence >= 0.70:** Auto-transition pipeline stage, write `application_events`
- **Actions on confidence < 0.70:** Store in `emails` table, notify JB, no auto-action

---

## Google Calendar Integration Specification

- **Scope required:** `calendar.readonly`
- **Trigger:** Calendar push notification or polling
- **Processing:** Match event company/recruiter against `applications` and `recruiters` tables
- **Action on match:** Transition to `interview_scheduled`, create `interviews` row
- **Post-event:** System prompts JB to confirm `interview_complete` after scheduled time passes

---

## Job Feed Ingestion Specification

- **Frequency:** Configurable per source; default every 4 hours
- **Deduplication:** By `source_url`; duplicate jobs are skipped silently and logged
- **Normalization:** All ingested jobs mapped to `jobs` schema regardless of source format
- **Scheduling:** Edge Function cron job with idempotent insert logic
- **Error handling:** Failed ingestion retried up to 3 times with exponential backoff; dead-letter logged
