# Data Model

> **Authoritative source of truth:** the generated `src/types/db.types.ts` (run `pnpm db:gen-types`
> after any schema change — non-negotiable #6) and the SQL in `supabase/migrations/`. This document
> is a **human-readable map**, not a substitute; when this doc and the generated types disagree, the
> generated types win and this doc must be corrected.

## Core tables

| Table | Purpose | Key notes |
| --- | --- | --- |
| `applications` | One row per user×job application; carries the current `stage` | User-scoped (RLS); `stage` changes are event-sourced |
| `application_events` | Append-only log of every stage transition | Immutable (see ADR on GDPR-purge vs. event immutability); written by the transition path only |
| `jobs` | User-scoped jobs (discovery surface) | `source IN ('prospector','corpus', …)`; graduates into `applications` |
| `application_answers` | Master Answers Library for ATS autofill | See `docs/adr/014-master-field-schema-and-answer-library.md` |
| `job_postings` (corpus) | Shared public ATS corpus | **No `user_id`/PII, ever** — authenticated read-all + service-role writes (approved RLS exception) |
| `crawl_queue` | Postgres-backed crawl work queue | Service-role only; drives the ATS crawler |
| Candidate profile tables | Profile/field schema feeding tailoring + autofill | See `docs/adr/012-candidate-profile-expansion-and-answer-library.md` |

## Access rules (non-negotiable)

1. **RLS always on** for every table (#1). The corpus is the *only* documented exception and is
   PII-free by construction.
2. **Single DB client** — all access through `src/lib/supabase.ts` (#2).
3. **User scoping** — every user-data query filters by `user_id` (#5). The corpus carries no
   `user_id` and must not be flagged as a data-isolation violation (cite the corpus ADR).
4. **Types generated, never handwritten** (#6).

## Where the rules live

- RLS / auth posture: `docs/domain/auth.md`
- Stage semantics: `docs/domain/pipeline-stages.md`
- Confirmed invariants: `docs/domain/business-rules.md` (`BR-001`..)
- Migrations: `supabase/migrations/*.sql`
