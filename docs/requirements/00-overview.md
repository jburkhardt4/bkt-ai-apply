# Requirements Overview

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03
**owner:** Business-Analyst Agent

---

## 1. Product Summary

BKT AI-Apply is a single-user, AI-orchestrated job application pipeline that enables John Burkhardt
(JB) to apply to 800+ qualified jobs per month. The system manages the full lifecycle from
job discovery through hire/rejection, integrates Gmail and Google Calendar intelligence, and
routes AI tasks across multiple models based on task type and cost policy.

---

## 2. Scope Boundary

### In Scope — MVP

- Job discovery ingestion (API feeds, RSS, CSV upload)
- AI job-match scoring (RAG, 0–100 scale)
- User-in-the-Loop (UITL) application packet prep and manual submission gate
- Resume and cover letter generation with version tracking
- Gmail parsing for recruiter signals (interview requests, rejections, offers)
- Google Calendar event detection and pipeline stage transitions
- Event-sourced pipeline state machine
- Real-time dashboard with audit trail
- AI chat assistant

### Deferred — Post-MVP

- **Stagehand browser automation** (SIGN-OFF-004): full autonomous form submission deferred; MVP uses UITL manual gate
- ZipRecruiter integration (SIGN-OFF-002): removed from MVP integration set
- Multi-user / enterprise roles
- Native mobile app

---

## 3. Signed-Off Decisions

| ID | Decision | Authority |
| --- | --- | --- |
| SIGN-OFF-001 | AI cost ceiling hard cap: **$75/month** across all model providers | JB |
| SIGN-OFF-002 | **ZipRecruiter removed** from MVP integration set | JB |
| SIGN-OFF-003 | External platform account setup: system **must query JB** before any configuration or registration attempt; preferred account email **[john@bktadvisory.com](mailto:john@bktadvisory.com)** | JB |
| SIGN-OFF-004 | Browser automation (Stagehand) **deferred to Post-MVP**; MVP submission path is UITL packet-prep gate | JB |
| SIGN-OFF-005 | Score thresholds: **match_score >= 60** → Consideration / manual review pipeline; **match_score >= 80** → Auto-Submit preparation gate | JB |

---

## 4. Primary Stakeholder

| Name | Role | Contact |
| --- | --- | --- |
| John Burkhardt | Power user, owner, final decision authority | [john@bktadvisory.com](mailto:john@bktadvisory.com) |

---

## 5. Document Map

| File | Topic |
| --- | --- |
| [01-feature-register.md](01-feature-register.md) | Feature IDs and MVP/Post-MVP classification |
| [02-user-stories.md](02-user-stories.md) | User stories with acceptance criteria |
| [03-data-entities.md](03-data-entities.md) | 14 core entities and relationships |
| [04-integrations.md](04-integrations.md) | Integration specs and constraints |
| [05-ai-routing.md](05-ai-routing.md) | Model routing matrix and cost policy |
| [06-security-compliance.md](06-security-compliance.md) | Security requirements and RLS policy |
| [07-nfr-and-slas.md](07-nfr-and-slas.md) | Non-functional requirements and SLAs |
| [08-gap-log.md](08-gap-log.md) | Open gaps and resolution status |
| [09-supabase-handoff.md](09-supabase-handoff.md) | Supabase-Security agent handoff packet |
| [../domain/business-rules.md](../domain/business-rules.md) | Living invariants register (BR-001+) |
