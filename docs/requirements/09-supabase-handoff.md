# Supabase-Security Agent Handoff

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**target_agent:** Supabase-Security
**status:** COMPLETED — all migrations applied
**issued_date:** 2026-06-03
**completed_date:** 2026-06-14

---

## Completion Summary

All 14 core entity migrations have been applied, plus additional feature migrations.

| Migration File | Entities |
| --- | --- |
| `20260603000001` – `20260603000014` | All 14 core entities (users, roles, companies, jobs, recruiters, documents, ai_scores, applications, application_materials, application_events, emails, interviews, notifications, ai_model_usage) |
| `20260603000015` | Realtime publications + Storage bucket |
| `20260605000001` | `transition_stage` RPC (atomic stage transitions — LSN-004) |
| `20260605000002` | application_materials RLS patch |
| `20260607000001`–`20260607000003` | Prospecting tables + search index + jobs.job_type |
| `20260608000001` | Chat tables (chat_conversations, chat_messages, chat_memory) |
| `20260612000001`–`20260612000004` | user_settings, saved_jobs, gmail_sync_state, application_queue |
| `20260613000001`–`20260613000004` | gmail_label_map, notifications.email_sent, consolidation, submission_worker RPCs |
| `20260614000001`–`20260614000003` | candidate_profiles, notifications.auto_submitted, jobs.description_formatted |

---

## Original Handoff Payload (archived for reference)

### schema_or_auth_change_summary

Draft SQL migrations for all 14 core entities as defined in
[03-data-entities.md](03-data-entities.md). This is the initial schema creation, not a
change — all tables must be created with RLS enabled from first migration.

### secrets_impact

- SUPABASE_SERVICE_ROLE_KEY: server-side Edge Functions only; never in client bundle
- GOOGLE_OAUTH_CLIENT_SECRET: stored in Supabase secrets
- AI provider keys (OpenAI, Anthropic, Google): stored in Supabase secrets; referenced by Edge Functions

---

## 14 Core Entities — Migration Scope

Supabase-Security must produce one migration file per entity group. The order below reflects
safe dependency order (no forward FK references).

### Batch 1 — Foundation

| Order | Entity | Key Constraints |
| --- | --- | --- |
| 1 | E-001: users | Extends Supabase `auth.users`; RLS: own row only |
| 2 | E-002: roles | FK → users; RLS: own rows only |
| 3 | E-003: companies | No user_id; RLS: authenticated read |

### Batch 2 — Job and Recruiter Layer

| Order | Entity | Key Constraints |
| --- | --- | --- |
| 4 | E-004: jobs | FK → users, companies; unique(source_url); RLS: user_id scoped |
| 5 | E-005: recruiters | FK → users, companies; RLS: user_id scoped |

### Batch 3 — Documents and Applications

| Order | Entity | Key Constraints |
| --- | --- | --- |
| 6 | E-008: documents | FK → users; no DELETE policy; immutable after is_locked=true |
| 7 | E-009: ai_scores | FK → users, jobs; RLS: user_id scoped |
| 8 | E-006: applications | FK → users, jobs; RLS: user_id scoped; stage enum check |
| 9 | E-007: application_materials | FK → applications, documents; RLS: via application |

### Batch 4 — Events, Emails, Interviews

| Order | Entity | Key Constraints |
| --- | --- | --- |
| 10 | E-010: application_events | FK → users, applications; **NO DELETE, NO UPDATE policy**; append-only |
| 11 | E-011: emails | FK → users; nullable FK → applications; RLS: user_id scoped |
| 12 | E-012: interviews | FK → users, applications; RLS: user_id scoped |

### Batch 5 — Operational

| Order | Entity | Key Constraints |
| --- | --- | --- |
| 13 | E-013: notifications | FK → users; nullable FK → applications; RLS: user_id scoped |
| 14 | E-014: ai_model_usage | FK → users; nullable FK → applications; RLS: user_id scoped |

---

## RLS Policy Requirements per Entity

### application_events (E-010) — Critical

```text
CREATE POLICY: SELECT where user_id = auth.uid()
CREATE POLICY: INSERT where user_id = auth.uid()
NO DELETE POLICY
NO UPDATE POLICY
```

This table is the immutable audit trail. Any migration that adds a DELETE or UPDATE policy
on this table must be blocked.

### documents (E-008) — Critical

```text
CREATE POLICY: SELECT where user_id = auth.uid()
CREATE POLICY: INSERT where user_id = auth.uid()
NO DELETE POLICY (soft-delete via is_locked)
UPDATE: blocked if is_locked = true (enforced via trigger or check constraint)
```

### companies (E-003) — Shared Lookup

```text
CREATE POLICY: SELECT for role = 'authenticated'
INSERT/UPDATE: restricted to admin role only (or system service role)
```

---

## Required Trigger / Constraint Specifications

| ID | Trigger/Constraint | Table | Purpose |
| --- | --- | --- | --- |
| TRG-001 | Prevent UPDATE when is_locked = true | documents | Enforce immutability after link |
| TRG-002 | Auto-set updated_at on UPDATE | applications, users | Timestamp maintenance |
| TRG-003 | Validate stage value against allowed enum | applications | Prevent invalid stage values |
| CHK-001 | UNIQUE constraint on source_url | jobs | Prevent duplicate job ingestion |
| CHK-002 | CHECK overall_score BETWEEN 0 AND 100 | ai_scores | Score range enforcement |
| CHK-003 | CHECK estimated_cost_usd >= 0 | ai_model_usage | Cost integrity |
| CHK-004 | CHECK confidence BETWEEN 0 AND 1 | emails | Confidence range enforcement |

---

## Pipeline Stage Enum

The `applications.stage` column must accept only these values:

```text
discovery
applied
screening
interview_scheduled
interview_complete
offer
hired
rejected
ghosted
```

Implement as a PostgreSQL `CHECK` constraint or custom type.

---

## Supabase Auth Configuration Requirements

| Item | Requirement |
| --- | --- |
| Auth provider | Google OAuth 2.0 |
| Redirect URL | Configure per environment (localhost + production) |
| Gmail scope | `gmail.readonly` |
| Calendar scope | `calendar.readonly` |
| JWT expiry | Default Supabase (1 hour); refresh tokens enabled |

---

## Realtime Requirements

Enable Realtime publication for:

| Table | Events |
| --- | --- |
| applications | UPDATE (stage changes) |
| application_events | INSERT (new events) |
| notifications | INSERT (new notifications for JB) |
| ai_scores | INSERT (new scores available) |

---

## Storage Requirements

Create Supabase Storage bucket:

| Bucket | Access | Purpose |
| --- | --- | --- |
| `documents` | Private (authenticated only) | Resume and cover letter file storage |

Storage policies must enforce user_id path prefix: `{user_id}/{document_id}.*`

---

## security_findings (Pre-Migration Checklist)

Supabase-Security agent must verify before submitting migration PRs:

- [ ] RLS enabled on all 14 tables
- [ ] No table has a public (anon) SELECT policy on user-scoped data
- [ ] `application_events` has no DELETE or UPDATE policy
- [ ] `documents` prevents mutation when `is_locked = true`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not referenced in any client-side code
- [ ] All FKs defined with appropriate ON DELETE behavior (CASCADE vs. RESTRICT)
- [ ] `ai_model_usage` includes monthly aggregate query support (index on user_id + called_at)
- [ ] Realtime publications do not expose other users' data (user_id filter on subscription)

---

## types_generation_status

After migrations are applied:

1. Run `pnpm db:gen-types` to regenerate `src/types/db.types.ts`
2. Commit generated types with migration files in same PR
3. Zero TypeScript errors required before merge
