# Business Rules

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LIVING DOCUMENT — append only; never delete rules; supersede with new rule ID
**last_updated:** 2026-06-03

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
