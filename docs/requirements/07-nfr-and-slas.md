# Non-Functional Requirements and SLAs

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## Performance

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-PERF-001 | Dashboard initial load | < 2 seconds at P95 |
| NFR-PERF-002 | Pipeline stage transition (system-triggered) | < 3 seconds end-to-end |
| NFR-PERF-003 | AI match score generation per job | < 10 seconds |
| NFR-PERF-004 | Cover letter generation | < 30 seconds |
| NFR-PERF-005 | Email classification latency (webhook to stage update) | < 15 seconds |
| NFR-PERF-006 | Calendar event detection latency | < 60 seconds from event creation |

---

## Scalability

| ID | Requirement |
| --- | --- |
| NFR-SCALE-001 | System supports ingestion and scoring of 1,000 jobs per month |
| NFR-SCALE-002 | `application_events` table supports unbounded append without degrading query performance |
| NFR-SCALE-003 | AI scoring pipeline handles bursts of 50 concurrent score requests |

---

## Availability and Reliability

| ID | Requirement |
| --- | --- |
| NFR-AVAIL-001 | Target uptime: 99.5% measured monthly |
| NFR-AVAIL-002 | Automation failure rate (failed stage transitions / total): < 2% |
| NFR-AVAIL-003 | All automated workflows are idempotent; duplicate triggers produce no duplicate side effects |
| NFR-AVAIL-004 | Failed job ingestion retried up to 3 times with exponential backoff |
| NFR-AVAIL-005 | Dead-letter queue captures all unrecoverable failures with structured log entry |

---

## Observability

| ID | Requirement |
| --- | --- |
| NFR-OBS-001 | All Edge Functions emit structured JSON logs with: timestamp, function_name, result, error (if any) |
| NFR-OBS-002 | All AI calls logged to `ai_model_usage` with tokens, cost, task_type |
| NFR-OBS-003 | All pipeline stage transitions logged to `application_events` with actor and reason |
| NFR-OBS-004 | 100% of automation actions are represented in `application_events` audit trail |
| NFR-OBS-005 | Dashboard surfaces: monthly AI spend, failure rate, last sync timestamps |

---

## Maintainability

| ID | Requirement |
| --- | --- |
| NFR-MAINT-001 | AI model routing logic isolated in `src/lib/ai-router.ts`; swappable without downstream changes |
| NFR-MAINT-002 | All integrations implemented behind adapter interfaces; new sources require no core changes |
| NFR-MAINT-003 | Supabase schema changes require migration files; never applied manually |
| NFR-MAINT-004 | `pnpm validate` (typecheck + lint + test) must pass before any PR merge |
| NFR-MAINT-005 | Generated DB types (`src/types/db.types.ts`) regenerated via `pnpm db:gen-types` after every schema change |

---

## Business KPIs (Success Metrics)

| Metric | Target |
| --- | --- |
| Applications per month | ≥ 800 |
| Average time per application | < 2 minutes |
| AI job-match accuracy (positive feedback) | ≥ 75% |
| Interview conversion rate | ≥ 5% |
| Logged action coverage | 100% |
| Monthly AI cost | ≤ $75 (hard cap) |

---

## Data Retention

| Data Type | Retention Policy |
| --- | --- |
| application_events | Permanent; never deleted |
| applications | User-controlled deletion (GDPR) |
| emails | 12 months rolling; user can purge |
| ai_model_usage | 13 months rolling for billing reconciliation |
| documents | User-controlled deletion |
| audit logs (Edge Function) | 90 days in logging service |
